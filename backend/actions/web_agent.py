"""Autonomous goal-driven web agent: drive the user's real Chrome to do a task.

Unlike ``browser_control`` (a low-level selector tool with an ephemeral browser
that is never logged in anywhere), this agent always works inside the user's own,
signed-in Chrome and picks the driving mechanism that fits the moment:

  - Whether Chrome is open or closed, we prefer driving it ON-SCREEN: open the target
    URL with ``chrome.exe`` (real Chrome, your profile, no automation banner) and act
    via screenshot + vision + mouse/keyboard — like ``computer_use``.
  - Playwright CDP is a fallback only when on-screen control is unavailable (no
    PyAutoGUI / Chrome binary) or when ``EXOSITES_WEB_AGENT_ISOLATED=1``.
  - On a password / 2FA / captcha wall it hands off: brings the window to the front
    and returns ``needs_user`` with a concrete instruction.

All Playwright work runs on a single dedicated worker thread (Playwright's sync
API is thread-affine), so the persistent context is created, used, and torn down
on one thread no matter which caller thread invokes the tool. The on-screen driver
runs on that same worker so overlapping calls stay serialized.

Guardrails mirror ``computer_use``: bounded steps + wall-clock deadline, and a
shared credential guard that refuses to type into secret fields.
"""

from __future__ import annotations

import io
import json
import logging
import os
import re
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

from actions.credential_guard import enforce_credential_guard
from constants import APP_DISPLAY_NAME
from orchestrator.capabilities import Capability
from orchestrator.conductor import candidates_for
from orchestrator.health import is_transient_error
from orchestrator.vision import VisionError, audit_relay_callback, vision_complete
from safe_web_url import normalize_public_web_url

logger = logging.getLogger(__name__)

MAX_STEPS_CAP = 24
DEFAULT_MAX_STEPS = 16
OVERALL_DEADLINE_S = 150
STEP_PAUSE_S = 0.7
NAV_TIMEOUT_MS = 45_000

# Per-step retry for a transient vision failure (provider drop, DNS blip) before
# giving up the step. Provider failover already happens inside vision_complete;
# this adds a short same-call retry so a brief network hiccup doesn't abort the run.
VISION_RETRIES = 2
VISION_RETRY_BASE_S = 1.5
VIEWPORT_WIDTH = 1280
VIEWPORT_HEIGHT = 800

_POINT_ACTIONS = {"click", "double_click"}
_ALL_ACTIONS = _POINT_ACTIONS | {
    "navigate", "type", "key", "scroll", "wait",
    "extract", "done", "needs_login", "fail",
}

# Module-level persistent browser so logins survive across calls. These are only
# ever touched on the single browser worker thread (see ``_executor``); Playwright's
# sync API is thread-affine, so cross-thread access corrupts the context.
_pw: Any = None
_context: Any = None

# One dedicated worker thread owns all Playwright objects. Every public entry point
# submits its browser work here and blocks, so create/use/close stay on one thread.
_browser_executor: ThreadPoolExecutor | None = None
_executor_lock = threading.Lock()

# Single-flight cancellation. The browser worker runs one task at a time; when a new
# request arrives (e.g. the user asks for something else while a run is in flight),
# the caller signals the in-flight run to stop so the worker frees up promptly.
_active_cancel: threading.Event | None = None
_cancel_lock = threading.Lock()


def cancel_web_agent_run(reason: str = "superseded") -> bool:
    """Signal the in-flight web_agent run (if any) to stop at its next step.

    Safe to call from any thread. Returns True when a running task was signalled.
    """
    with _cancel_lock:
        event = _active_cancel
    if event is not None and not event.is_set():
        event.set()
        logger.info("[web_agent] cancel requested (%s)", reason)
        return True
    return False


def _register_active_cancel() -> threading.Event:
    """Create and register the cancel event for a run that is about to start."""
    event = threading.Event()
    with _cancel_lock:
        global _active_cancel
        _active_cancel = event
    return event


def _clear_active_cancel(event: threading.Event) -> None:
    """Unregister ``event`` as the active cancel target once its run has ended."""
    with _cancel_lock:
        global _active_cancel
        if _active_cancel is event:
            _active_cancel = None

# Isolated fallback profile, only used when no real Chrome install is found.
_PROFILE_DIRNAME = "chrome_agent_profile"

# Set EXOSITES_WEB_AGENT_ISOLATED=1 to force the isolated profile instead of the
# user's real Chrome profile (e.g. for testing, or to avoid touching their browser).
_ISOLATED_ENV = "EXOSITES_WEB_AGENT_ISOLATED"

_SYSTEM_PROMPT = (
    "You drive a real web browser to accomplish the user's task. Each turn you get a "
    "screenshot of the current page, its URL, title, and the visible page text; decide "
    "the SINGLE next action.\n\n"
    "Coordinates: give x and y as fractions (0..1) of the screenshot width/height at the "
    "CENTER of the target element.\n\n"
    "Actions:\n"
    "- navigate {url}: load a URL (use a full https:// address).\n"
    "- click / double_click {x,y}: click an element at a point.\n"
    "- type {text}: type into the focused field (click it first).\n"
    "- key {keys:[...]}: press a key or chord, e.g. [\"Enter\"], [\"Control\",\"a\"].\n"
    "- scroll {amount}: positive scrolls up, negative scrolls down.\n"
    "- wait: the page is still loading / nothing actionable yet.\n"
    "- extract {answer}: you can SEE the answer in the page text — return it verbatim "
    "and concise in 'answer' (e.g. 'You have $42.10 of credits remaining').\n"
    "- done {answer}: the task is complete; put the final result/confirmation in 'answer'.\n"
    "- needs_login {reason}: ONLY when the user must TYPE a password, 2FA / one-time code, "
    "or captcha themselves. You CANNOT type those — use this so the human takes over.\n"
    "- fail {reason}: the task cannot be done (page broken, not found, impossible).\n\n"
    "Rules: NEVER type passwords, 2FA codes, or captcha answers (use needs_login). "
    "But DO click through sign-in choosers that need no typing: 'Continue with Google', "
    "'Continuer avec Google', Google One Tap / 'Continue as [name]' / 'Continuer en tant "
    "que …', 'Sign in with Google', account-picker rows, and OAuth consent buttons — "
    "those are safe one-click steps; click them, do NOT use needs_login. needs_login is "
    "only when a password field, 2FA code box, or captcha must be filled in. When "
    "the answer the user asked for is visible, prefer extract/done immediately — do not "
    "keep clicking. Be efficient; reach the goal in as few steps as possible.\n\n"
    "Set \"sensitive\": true whenever the current screen is a password, passcode, 2FA / "
    "one-time-code, or captcha entry. The host enforces this: a type action on a "
    "sensitive screen is refused and control is handed to the user.\n\n"
    "Respond with ONLY JSON: {\"type\": <action>, \"x\": <0..1|null>, \"y\": <0..1|null>, "
    "\"url\": <string|null>, \"text\": <string|null>, \"keys\": <array|null>, "
    "\"amount\": <int|null>, \"answer\": <string|null>, \"sensitive\": <true|false>, "
    "\"reason\": <short reason>}."
)

_NEEDS_LOGIN_SECRET_REASON = (
    "A password / verification screen was detected. The assistant never types "
    "credentials, so control is handed back to you."
)


def _profile_dir() -> str:
    """Stable on-disk path for the persistent browser profile.

    Uses the Electron-provided user-data dir when available so the profile lives
    beside the app's other state; falls back to the home directory otherwise.
    """
    base = os.environ.get("EXOSITES_USER_DATA") or str(Path.home())
    path = Path(base) / _PROFILE_DIRNAME
    path.mkdir(parents=True, exist_ok=True)
    return str(path)


def _executor() -> ThreadPoolExecutor:
    """Return the lazily-created single browser worker thread.

    All Playwright objects are created and used on this one thread so the sync
    API's thread affinity is never violated, and overlapping calls serialize.
    """
    global _browser_executor
    if _browser_executor is None:
        with _executor_lock:
            if _browser_executor is None:
                _browser_executor = ThreadPoolExecutor(
                    max_workers=1, thread_name_prefix="web-agent"
                )
    return _browser_executor


def _default_chrome_user_data() -> Path | None:
    """Best-effort path to the user's default Chrome ``User Data`` directory."""
    if sys.platform.startswith("win"):
        base = os.environ.get("LOCALAPPDATA")
        candidate = Path(base) / "Google/Chrome/User Data" if base else None
    elif sys.platform == "darwin":
        candidate = Path.home() / "Library/Application Support/Google/Chrome"
    else:
        candidate = Path.home() / ".config/google-chrome"
    return candidate if candidate and candidate.exists() else None


def _first_profile_name(user_data_root: Path) -> str:
    """Name of the user's primary Chrome profile folder (last-used, else 'Default').

    Reads ``Local State`` so we open the profile the user actually signs in with,
    not necessarily ``Default`` (people often live in ``Profile 1``).
    """
    try:
        state = json.loads((user_data_root / "Local State").read_text(encoding="utf-8"))
        profile = state.get("profile", {})
        last_used = str(profile.get("last_used") or "").strip()
        if last_used and (user_data_root / last_used).is_dir():
            return last_used
        info_cache = profile.get("info_cache")
        if isinstance(info_cache, dict) and info_cache:
            first = next(iter(info_cache))
            if (user_data_root / first).is_dir():
                return first
    except Exception:  # noqa: BLE001 — fall back to the standard default profile
        logger.debug("web_agent first-profile detection failed", exc_info=True)
    return "Default"


class ChromeBusyError(RuntimeError):
    """The user's Chrome is already running, so its profile is locked to that process.

    Chrome allows only one process per profile, so we can't drive the user's real,
    signed-in profile while their everyday Chrome holds it. The caller surfaces this
    as a ``needs_user`` ask to close Chrome and retry.
    """


_CHROME_PROCESS_NAMES = (
    ("chrome.exe",) if sys.platform.startswith("win")
    else ("Google Chrome",) if sys.platform == "darwin"
    else ("chrome", "google-chrome", "chromium", "chromium-browser")
)


def _user_chrome_running() -> bool:
    """True if a Chrome process is already running (it would lock the real profile).

    Best-effort: if ``psutil`` is unavailable we return False and let the launch
    attempt itself surface the conflict.
    """
    try:
        import psutil
    except Exception:  # noqa: BLE001 — detection is best-effort
        return False
    wanted = {name.lower() for name in _CHROME_PROCESS_NAMES}
    for proc in psutil.process_iter(["name"]):
        try:
            name = (proc.info.get("name") or "").lower()
        except Exception:  # noqa: BLE001 — process vanished mid-iteration
            continue
        if name in wanted:
            return True
    return False


_CHROME_BUSY_MESSAGE = (
    "I use your own Chrome profile so it's already signed in, but Chrome is open right "
    "now and it locks that profile to one window. Please close all Chrome windows, then "
    "ask me again and I'll open your signed-in profile and check it."
)


def _macos_screen_capture_permission_reason(exc: BaseException | None = None) -> str:
    """Plain-language fix when screen capture is blocked by macOS TCC."""
    if not sys.platform == "darwin":
        return ""
    if os.environ.get("EXOSITES_ELECTRON_CAPTURE_URL", "").strip():
        return (
            f"macOS blocked screen capture for {APP_DISPLAY_NAME}. Open System Settings → "
            f"Privacy & Security → Screen & System Audio Recording, turn on **{APP_DISPLAY_NAME}**, "
            "then ask me again."
        )
    if exc is None:
        return ""
    msg = f"{type(exc).__name__}: {exc}".lower()
    if not any(
        needle in msg
        for needle in (
            "unidentifiedimageerror",
            "could not create image",
            "cannot identify image file",
            "screen capture",
        )
    ):
        return ""
    python_path = sys.executable
    return (
        "macOS blocked screen capture for the app's background service (Python — not the "
        "Exosites window or Cursor). Open System Settings → Privacy & Security → "
        "Screen & System Audio Recording, turn on **Python** (or click + and choose "
        f"{python_path}), then ask me again. Chrome being allowed is not enough."
    )


def _capture_screen_jpeg_via_electron() -> tuple[bytes | None, str | None]:
    """Capture the primary display through the Electron loopback bridge (macOS TCC → app name).

    :returns: ``(jpeg_bytes, permission_reason)`` — when ``permission_reason`` is set, capture
        was denied and the caller should surface it to the user.
    """
    url = os.environ.get("EXOSITES_ELECTRON_CAPTURE_URL", "").strip()
    token = os.environ.get("EXOSITES_APP_TOKEN", "").strip()
    if not url or not token:
        return None, None
    try:
        import json
        import urllib.error
        import urllib.request

        req = urllib.request.Request(
            url,
            data=b"{}",
            method="POST",
            headers={
                "Content-Type": "application/json",
                "X-App-Token": token,
            },
        )
        with urllib.request.urlopen(req, timeout=20) as resp:
            content_type = (resp.headers.get("Content-Type") or "").lower()
            if "image/jpeg" in content_type:
                return resp.read(), None
            body = resp.read().decode("utf-8", errors="replace")
            try:
                payload = json.loads(body)
            except json.JSONDecodeError:
                payload = {}
            if isinstance(payload, dict) and payload.get("error") == "screen_permission_denied":
                return None, _macos_screen_capture_permission_reason()
            logger.warning("[web_agent] electron capture failed: %r", payload or body[:200])
            return None, None
    except urllib.error.HTTPError as exc:
        logger.warning("[web_agent] electron capture http_%s", exc.code)
        return None, None
    except Exception as exc:  # noqa: BLE001
        logger.warning("[web_agent] electron capture error: %s", exc)
        return None, None


_LAUNCH_ARGS = ["--no-first-run", "--no-default-browser-check", "--hide-crash-restore-bubble"]

# Pause after opening a new tab in the running Chrome before the first screenshot,
# so the page has a moment to start rendering for the vision model.
_OPEN_TAB_SETTLE_S = 2.5

# When the model omits ``start_url``, infer a sensible landing page from the task text
# so we don't sit on ``about:blank`` waiting for a vision step that may never come.
# Order matters: more specific (billing/usage) hints come before generic ones so a
# "gemini credits" task lands on the usage page, not the API-keys page.
_START_URL_HINTS: tuple[tuple[tuple[str, ...], str], ...] = (
    (("anthropic", "entropic"), "https://console.anthropic.com/settings/billing"),
    (("cursor",), "https://www.cursor.com/settings"),
    (("openai",), "https://platform.openai.com/usage"),
    (("gemini credits", "gemini account", "gemini billing", "gemini usage"),
     "https://aistudio.google.com/usage"),
    (("google ai", "ai studio", "gemini api", "gemini"), "https://aistudio.google.com/apikey"),
)

# Words that mean "just read a number off the account page" — used to enable the
# text-first fast path that answers without a vision step when the page already
# shows the figure.
_BALANCE_READ_KEYWORDS = (
    "credit", "credits", "balance", "billing", "usage", "remaining", "quota",
    "solde", "crédit", "credito", "guthaben",
)

# Currency / credit figures, e.g. "$12.34", "12,50 USD", "1500 credits", "80% used".
_BALANCE_VALUE_RE = re.compile(
    r"(?:[$€£]\s?\d[\d.,]*"
    r"|\d[\d.,]*\s?(?:usd|eur|gbp|us\$|credits?|crédits?|tokens?)"
    r"|\d[\d.,]*\s?%)",
    re.IGNORECASE,
)


def _infer_start_url(task: str) -> str:
    """Best-effort URL from task keywords when the caller did not pass ``start_url``."""
    lower = task.lower()
    for keywords, url in _START_URL_HINTS:
        if any(word in lower for word in keywords):
            return url
    return ""


def _is_balance_read_task(task: str) -> bool:
    """True when the task is a simple "read my credits/balance/usage" lookup."""
    lower = task.lower()
    return any(word in lower for word in _BALANCE_READ_KEYWORDS)


def _try_extract_balance_from_text(text: str) -> str | None:
    """Pull a short balance/credit figure with context from already-visible page text.

    Returns the line containing the first currency/credit/percentage figure, so the
    voice agent can answer a "how many credits do I have" question without spending a
    vision step. Returns None when no figure is present (page still loading, etc.).
    """
    if not text:
        return None
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if line and _BALANCE_VALUE_RE.search(line):
            return line[:200]
    return None


def _chrome_executable_candidates() -> list[Path]:
    """Common install locations for the user's Chrome binary (mirrors chromeAutopilot)."""
    if sys.platform.startswith("win"):
        roots = [os.environ.get("PROGRAMFILES"), os.environ.get("PROGRAMFILES(X86)"),
                 os.environ.get("LOCALAPPDATA")]
        return [Path(r) / "Google/Chrome/Application/chrome.exe" for r in roots if r]
    if sys.platform == "darwin":
        return [Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")]
    return [Path(p) for p in (
        "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium-browser",
    )]


def _find_chrome_executable() -> Path | None:
    """First Chrome binary that exists on disk, or ``None`` if none is installed."""
    for candidate in _chrome_executable_candidates():
        try:
            if candidate.exists():
                return candidate
        except OSError:  # unreadable path — keep looking
            continue
    return None


def _launch_isolated(pw: Any) -> Any:
    """Fallback when no real Chrome install exists: a dedicated profile (real or Chromium)."""
    profile_dir = _profile_dir()
    try:
        return pw.chromium.launch_persistent_context(
            profile_dir, channel="chrome", headless=False, no_viewport=True, args=_LAUNCH_ARGS
        )
    except Exception as exc:  # noqa: BLE001 — Chrome missing / channel unavailable
        logger.warning("[web_agent] real Chrome unavailable (%s); using bundled Chromium", exc)
        return pw.chromium.launch_persistent_context(
            profile_dir, headless=False, no_viewport=True, args=_LAUNCH_ARGS
        )


def _launch_persistent(pw: Any) -> Any:
    """Launch the user's REAL, signed-in Chrome profile (their actual ``User Data``).

    Uses ``channel="chrome"`` against the user's real ``User Data`` directory and their
    actual profile folder, so the agent sees the very same cookies and Google sign-in
    the user already has — no copying (which Chrome's app-bound encryption defeats).

    :raises ChromeBusyError: if Chrome is already running and holds the profile lock.
    """
    real_root = _default_chrome_user_data()
    forced_isolated = os.environ.get(_ISOLATED_ENV, "").strip().lower() in ("1", "true", "yes")
    if real_root is None or forced_isolated:
        return _launch_isolated(pw)

    if _user_chrome_running():
        raise ChromeBusyError(_CHROME_BUSY_MESSAGE)

    profile = _first_profile_name(real_root)
    args = [*_LAUNCH_ARGS, f"--profile-directory={profile}"]
    try:
        context = pw.chromium.launch_persistent_context(
            str(real_root), channel="chrome", headless=False, no_viewport=True, args=args
        )
    except Exception as exc:  # noqa: BLE001 — almost always the profile lock (Chrome open)
        raise ChromeBusyError(_CHROME_BUSY_MESSAGE) from exc
    logger.info("[web_agent] launched your real Chrome profile %r", profile)
    return context


def _close_context() -> None:
    """Tear down the current persistent context (releases the profile lock)."""
    global _pw, _context
    try:
        if _context is not None:
            _context.close()
        if _pw is not None:
            _pw.stop()
    except Exception:  # noqa: BLE001 — teardown must never raise
        logger.debug("web_agent close_context", exc_info=True)
    finally:
        _pw = _context = None


def _ensure_context() -> Any:
    """Return a Playwright page for the persistent real-Chrome profile.

    MUST be called on the browser worker thread. Reuses the open context across
    calls so logins persist; relaunches if a stale context can no longer be read.

    :raises ImportError: if Playwright is not installed.
    :raises RuntimeError: if no browser can be launched.
    """
    global _pw, _context
    if _context is not None:
        try:
            pages = _context.pages
            return pages[0] if pages else _context.new_page()
        except Exception:  # noqa: BLE001 — window closed / context stale: relaunch
            logger.info("[web_agent] persistent context was stale; relaunching")
            _close_context()

    _close_context()
    from playwright.sync_api import sync_playwright

    _pw = sync_playwright().start()
    try:
        _context = _launch_persistent(_pw)
    except Exception:
        _close_context()  # don't leave the Playwright driver running on a failed launch
        raise
    _context.set_default_navigation_timeout(NAV_TIMEOUT_MS)
    pages = _context.pages
    return pages[0] if pages else _context.new_page()


def _extract_json(text: str) -> Any:
    text = (text or "").strip()
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            return None
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            return None


def _clamp01(value: Any) -> float | None:
    try:
        return min(max(float(value), 0.0), 1.0)
    except (TypeError, ValueError):
        return None


def _page_snapshot(page: Any) -> tuple[bytes, str, str, str]:
    """Capture (jpeg, url, title, visible_text) of the current page."""
    jpeg = page.screenshot(type="jpeg", quality=70)
    url = page.url or ""
    try:
        title = page.title() or ""
    except Exception:  # noqa: BLE001 — title can fail mid-navigation
        title = ""
    try:
        text = page.inner_text("body", timeout=5_000)[:3000]
    except Exception:  # noqa: BLE001 — body may not be ready
        text = ""
    return jpeg, url, title, text


def _decide_action(
    task: str, history: list[str], snapshot: tuple[bytes, str, str, str], *, full_screen: bool = False
) -> dict[str, Any]:
    """Ask the vision relay for the next browser action.

    :raises VisionError: if every configured vision provider is unavailable.
    """
    jpeg, url, title, text = snapshot
    recent = "\n".join(f"- {h}" for h in history[-8:]) if history else "(none)"
    screen_note = (
        "\nNote: the screenshot is the FULL desktop (browser window + taskbar). "
        "Coordinates are fractions of the entire image.\n"
        if full_screen else ""
    )
    user_text = (
        f"Task: {task}\n"
        f"Current URL: {url or '(blank)'}\n"
        f"Page title: {title or '(none)'}\n"
        f"Visible page text (truncated):\n{text or '(empty)'}\n"
        f"{screen_note}\n"
        f"Steps so far:\n{recent}"
    )
    raw = vision_complete(
        user_text, jpeg, mime_type="image/jpeg", system=_SYSTEM_PROMPT,
        on_relay=audit_relay_callback(f"web_agent: {task[:120]}"),
    )
    parsed = _extract_json(raw)
    if not isinstance(parsed, dict):
        return {"type": "wait", "reason": "unparseable model output"}
    action_type = str(parsed.get("type") or "").strip().lower()
    if action_type not in _ALL_ACTIONS:
        return {"type": "wait", "reason": f"unknown action {action_type!r}"}
    parsed["type"] = action_type
    return parsed


def _decide_with_retry(
    task: str,
    history: list[str],
    snapshot: tuple[bytes, str, str, str],
    deadline: float,
    *,
    full_screen: bool = False,
) -> dict[str, Any]:
    """Decide the next action, retrying transient vision failures with backoff.

    Provider failover (Gemini -> Anthropic -> ...) already happens one level down in
    ``vision_complete``; this adds a short same-call retry so a brief connection or
    DNS blip that knocks out every provider at once doesn't abort the whole run.

    :raises VisionError: on a non-transient failure, or when transient retries are
        exhausted / would exceed the deadline (the caller decides how to surface it).
    """
    attempt = 0
    while True:
        try:
            return _decide_action(task, history, snapshot, full_screen=full_screen)
        except VisionError as exc:
            attempt += 1
            if not is_transient_error(str(exc)) or attempt > VISION_RETRIES:
                raise
            delay = VISION_RETRY_BASE_S * attempt
            if time.monotonic() + delay > deadline:
                raise
            logger.info(
                "[web_agent] transient vision failure (%s); retry %d/%d in %.1fs",
                exc, attempt, VISION_RETRIES, delay,
            )
            time.sleep(delay)


def _page_size(page: Any) -> tuple[float, float]:
    """Live (width, height) of the page's viewport, for fraction->pixel clicks.

    The real Chrome window is not a fixed size, so we read the actual inner size
    each time and fall back to the nominal constants if the page can't be queried.
    """
    try:
        size = page.evaluate("() => [window.innerWidth, window.innerHeight]")
        width, height = float(size[0]), float(size[1])
        if width > 0 and height > 0:
            return width, height
    except Exception:  # noqa: BLE001 — page not ready / no JS context
        pass
    return float(VIEWPORT_WIDTH), float(VIEWPORT_HEIGHT)


def _perform(page: Any, action: dict[str, Any]) -> str | None:
    """Execute one browser action. Returns an error string, or None on success."""
    atype = action["type"]
    if atype == "navigate":
        url = str(action.get("url") or "").strip()
        if not url:
            return None
        safe_url = normalize_public_web_url(url)
        if not safe_url:
            return "navigation blocked: private or local addresses are not allowed"
        page.goto(safe_url, wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)
        return None
    if atype in _POINT_ACTIONS:
        x, y = _clamp01(action.get("x")), _clamp01(action.get("y"))
        if x is None or y is None:
            return None
        width, height = _page_size(page)
        px, py = x * width, y * height
        if atype == "double_click":
            page.mouse.dblclick(px, py)
        else:
            page.mouse.click(px, py)
        return None
    if atype == "type":
        page.keyboard.type(str(action.get("text") or ""), delay=20)
        return None
    if atype == "key":
        keys = action.get("keys")
        if isinstance(keys, list) and keys:
            page.keyboard.press("+".join(str(k) for k in keys))
        return None
    if atype == "scroll":
        try:
            amount = int(action.get("amount") or -3)
        except (TypeError, ValueError):
            amount = -3
        page.mouse.wheel(0, -amount * 200)
        return None
    return None


class _PlaywrightDriver:
    """Drive a CDP-controlled Chrome page (precise: real DOM text + page clicks).

    Used when Chrome is closed and we launched the user's real profile ourselves.
    """

    full_screen = False

    def __init__(self, page: Any) -> None:
        self._page = page

    @property
    def url(self) -> str:
        try:
            return self._page.url or ""
        except Exception:  # noqa: BLE001 — page may be mid-navigation
            return ""

    def bring_to_front(self) -> None:
        try:
            self._page.bring_to_front()
        except Exception:  # noqa: BLE001 — best-effort focus
            pass

    def snapshot(self) -> tuple[bytes, str, str, str]:
        return _page_snapshot(self._page)

    def perform(self, action: dict[str, Any]) -> str | None:
        return _perform(self._page, action)


class _ScreenDriver:
    """Drive the user's ALREADY-OPEN, signed-in Chrome on-screen (OS mouse/keyboard).

    Chrome locks a profile to one process, so we cannot attach to the user's running
    browser over CDP. Instead we open the target as a NEW TAB in that real window
    (``chrome.exe <url>`` reuses the running instance) and act with PyAutoGUI, reading
    the page from full-screen screenshots — the same engine as ``control_computer``.
    Less precise than CDP, but it needs no profile lock, so we never ask the user to
    close Chrome and it always uses the session they're actually logged into.
    """

    full_screen = True

    def __init__(self, pg: Any, chrome_exe: Path) -> None:
        self._pg = pg
        self._chrome = chrome_exe
        self._last_url = ""
        # Capture and input share one PyAutoGUI coordinate space; remember the last
        # screenshot's size so fractional click targets map back to real pixels.
        self._size = (0.0, 0.0)

    @property
    def url(self) -> str:
        return self._last_url or "(your open Chrome window)"

    def bring_to_front(self) -> None:
        # Opening a tab via the Chrome CLI already focuses the window; nothing reliable
        # and cross-platform to do beyond that.
        return None

    def _open_tab(self, url: str) -> None:
        """Open ``url`` as a new tab in the user's running Chrome and let it focus."""
        try:
            subprocess.Popen(  # noqa: S603 — fixed Chrome binary + a normalized URL
                [str(self._chrome), url],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
        except Exception as exc:  # noqa: BLE001 — surfaced to the loop as a step error
            logger.warning("[web_agent] could not open tab in your Chrome: %s", exc)
            return
        self._last_url = url
        time.sleep(_OPEN_TAB_SETTLE_S)

    def snapshot(self) -> tuple[bytes, str, str, str]:
        jpeg_bytes, permission_reason = _capture_screen_jpeg_via_electron()
        if permission_reason:
            raise PermissionError(permission_reason)
        if jpeg_bytes:
            from PIL import Image

            img = Image.open(io.BytesIO(jpeg_bytes)).convert("RGB")
        else:
            img = self._pg.screenshot().convert("RGB")
        self._size = (float(img.size[0]), float(img.size[1]))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=70)
        # No DOM to read on-screen; the model works from the screenshot + address bar.
        return buf.getvalue(), self.url, "", ""

    def perform(self, action: dict[str, Any]) -> str | None:
        atype = action["type"]
        if atype == "navigate":
            url = str(action.get("url") or "").strip()
            if not url:
                return None
            safe_url = normalize_public_web_url(url)
            if not safe_url:
                return "navigation blocked: private or local addresses are not allowed"
            self._open_tab(safe_url)
            return None
        if atype in _POINT_ACTIONS:
            x, y = _clamp01(action.get("x")), _clamp01(action.get("y"))
            if x is None or y is None:
                return None
            width, height = self._size if self._size[0] else (self._pg.size())
            px, py = int(x * width), int(y * height)
            if atype == "double_click":
                self._pg.doubleClick(px, py)
            else:
                self._pg.click(px, py)
            return None
        if atype == "type":
            self._pg.typewrite(str(action.get("text") or ""), interval=0.02)
            return None
        if atype == "key":
            keys = action.get("keys")
            if isinstance(keys, list) and keys:
                self._pg.hotkey(*[str(k).lower() for k in keys])
            return None
        if atype == "scroll":
            try:
                amount = int(action.get("amount") or -3)
            except (TypeError, ValueError):
                amount = -3
            self._pg.scroll(amount)  # PyAutoGUI units: positive = up (matches the prompt)
            return None
        return None


def _hand_off_to_login(driver: Any, step: int, history: list[str], reason: str) -> dict[str, Any]:
    """Bring the visible Chrome window to the front so the user can sign in.

    The window is already the user's real, signed-in Chrome on the login page, so
    we just focus it and return ``needs_user`` — once the user signs in, the profile
    keeps the session and the next request handles the rest on its own.
    """
    driver.bring_to_front()
    return {"ok": True, "data": {
        "status": "needs_user", "steps": step, "log": history,
        "reason": (
            f"{reason} I've brought the Chrome window to the front so you can sign in. "
            "Once you're signed in, ask me again and I'll handle the rest on my own."
        ),
    }}


def _mirror(task_id: str | None, type_: str, **payload: Any) -> None:
    """Best-effort push of one progress frame to the cube visualizer (no-op without one)."""
    if not task_id:
        return
    try:
        from agent.plan_mirror import mirror_event

        mirror_event(task_id, type_, **payload)
    except Exception:  # noqa: BLE001 — progress mirroring must never break the run
        logger.debug("web_agent mirror %s failed", type_, exc_info=True)


def _mirror_terminal(task_id: str | None, result: dict[str, Any]) -> None:
    """Close out the visualizer step + task from the final result."""
    if not task_id:
        return
    data = result.get("data") if isinstance(result.get("data"), dict) else {}
    status = str(data.get("status") or "").strip().lower()
    ok = bool(result.get("ok")) and status not in ("failed",)
    _mirror(task_id, "step_done", step=1, ok=ok)
    if result.get("ok") and status not in ("failed",):
        final = str(data.get("answer") or data.get("reason") or "Done.").strip()
        _mirror(task_id, "task_complete", result=final)
    else:
        err = str(result.get("error") or data.get("reason") or "It didn't work.").strip()
        _mirror(task_id, "task_error", error=err)
    try:
        from agent.plan_mirror import finalize_mirror_task

        finalize_mirror_task(task_id)
    except Exception:  # noqa: BLE001
        logger.debug("web_agent finalize failed", exc_info=True)


def _run_browser_loop(
    driver: Any, task: str, max_steps: int, deadline: float, vis_id: str | None,
    cancel: threading.Event | None = None,
) -> dict[str, Any]:
    """The vision -> act loop. Returns the tool result dict (never raises VisionError).

    ``driver`` is either a :class:`_PlaywrightDriver` (CDP, Chrome closed) or a
    :class:`_ScreenDriver` (on-screen, Chrome already open). The loop is identical
    either way — only snapshot/perform differ behind the driver.

    ``cancel`` is an optional event; when set (e.g. the user asked for something
    else), the loop stops at the next step boundary and returns ``cancelled``.
    """
    history: list[str] = []
    step = 0
    while step < max_steps:
        if cancel is not None and cancel.is_set():
            return {"ok": True, "data": {"status": "cancelled", "steps": step, "log": history,
                                         "url": driver.url, "reason": "superseded by a newer request"}}
        if time.monotonic() > deadline:
            return {"ok": True, "data": {"status": "incomplete", "steps": step, "log": history,
                                         "url": driver.url, "reason": "time limit reached"}}
        try:
            snapshot = driver.snapshot()
        except PermissionError as exc:
            return {"ok": True, "data": {
                "status": "needs_user", "steps": step, "log": history,
                "url": driver.url, "reason": str(exc),
            }}
        except Exception as exc:  # noqa: BLE001
            logger.exception("web_agent snapshot")
            permission_reason = _macos_screen_capture_permission_reason(exc)
            if permission_reason:
                return {"ok": True, "data": {
                    "status": "needs_user", "steps": step, "log": history,
                    "url": driver.url, "reason": permission_reason,
                }}
            return {"ok": False, "error": f"page capture failed: {exc}"}

        # Text-first fast path: if the page already shows the figure a balance/credits
        # lookup wants, answer straight from the DOM text and skip the vision call.
        if _is_balance_read_task(task):
            visible_text = snapshot[3]
            answer = _try_extract_balance_from_text(visible_text)
            if answer:
                history.append(f"extract: read balance from page text — {answer}")
                logger.info("[web_agent] fast-path balance read: %s", answer)
                return {"ok": True, "data": {"status": "done", "steps": step, "log": history,
                                             "url": driver.url, "answer": answer}}

        try:
            action = _decide_with_retry(
                task, history, snapshot, deadline, full_screen=getattr(driver, "full_screen", False)
            )
        except VisionError as exc:
            message = str(exc)
            if is_transient_error(message):
                logger.info("[web_agent] vision unavailable after retries; handing back to user")
                return {"ok": True, "data": {
                    "status": "needs_user", "steps": step, "log": history, "url": driver.url,
                    "reason": (
                        "I lost the connection while checking — it looks like the network or "
                        "the AI service dropped. Please check your connection and ask me again."
                    ),
                }}
            logger.warning("web_agent decide failed: %s", message)
            return {"ok": False, "error": message}
        except Exception as exc:  # noqa: BLE001
            logger.warning("web_agent decide failed: %s", exc)
            return {"ok": False, "error": str(exc)}

        step += 1
        action = enforce_credential_guard(
            action,
            handoff_type="needs_login",
            handoff_reason=_NEEDS_LOGIN_SECRET_REASON,
        )
        reason = str(action.get("reason") or action["type"])
        history.append(f"{action['type']}: {reason}")
        logger.info("[web_agent] step %d: %s (%s)", step, action["type"], reason)
        _mirror(vis_id, "step_start", step=1, description=reason[:120])

        if action["type"] in ("done", "extract"):
            answer = str(action.get("answer") or "").strip()
            return {"ok": True, "data": {"status": "done", "steps": step, "log": history,
                                         "url": driver.url, "answer": answer}}
        if action["type"] == "needs_login":
            return _hand_off_to_login(driver, step, history, reason)
        if action["type"] == "fail":
            return {"ok": True, "data": {"status": "failed", "steps": step, "log": history,
                                         "url": driver.url, "reason": reason}}
        if action["type"] == "wait":
            time.sleep(STEP_PAUSE_S * 2)
            continue

        try:
            err = driver.perform(action)
        except Exception as exc:  # noqa: BLE001
            logger.warning("web_agent perform %s failed: %s", action["type"], exc)
            history.append(f"error: {exc}")
            time.sleep(STEP_PAUSE_S)
            continue
        if err:
            return {"ok": False, "error": err}
        time.sleep(STEP_PAUSE_S)

    return {"ok": True, "data": {"status": "incomplete", "steps": max_steps, "log": history,
                                 "url": driver.url, "reason": "step limit reached"}}


def web_agent(parameters: dict[str, Any]) -> dict[str, Any]:
    """Autonomously drive a real browser to accomplish a task.

    :param parameters: ``task`` (required, plain-language goal), optional
        ``start_url`` (where to begin), ``max_steps`` (1..24, default 16), and
        ``_visualizer_task_id`` (internal: stream progress to the cube).
    :returns: ``{ok, data: {status, answer, url, steps, log}}`` where ``status``
        is one of ``done | needs_user | incomplete | failed``; or
        ``{ok: False, error}``.
    """
    task = str(parameters.get("task", "")).strip()
    if not task:
        return {"ok": False, "error": "task is required (describe the goal to do in the browser)."}

    if not candidates_for(Capability.VISION, require_vision=True):
        return {"ok": False, "error": (
            "No vision-capable AI provider is configured. Add a Gemini, OpenAI, or "
            "Anthropic key in Settings -> AI Provider."
        )}

    try:
        max_steps = int(parameters.get("max_steps", DEFAULT_MAX_STEPS))
    except (TypeError, ValueError):
        max_steps = DEFAULT_MAX_STEPS
    max_steps = min(max(max_steps, 1), MAX_STEPS_CAP)
    start_url = str(parameters.get("start_url", "")).strip()
    vis_id = str(parameters.get("_visualizer_task_id", "") or "").strip() or None
    auto_close_scope = str(parameters.get("_auto_close_scope", "") or "").strip() or None

    # All Playwright work runs on the single browser worker thread; block for it.
    try:
        return _executor().submit(
            _web_agent_impl, task, max_steps, start_url, vis_id, auto_close_scope
        ).result()
    except Exception as exc:  # noqa: BLE001 — worker died unexpectedly
        logger.exception("web_agent worker")
        return {"ok": False, "error": f"the browser agent crashed: {exc}"}


def _existing_page() -> Any | None:
    """Return a page from a still-live persistent context, or ``None`` (no launch).

    Lets us reuse the CDP Chrome we launched earlier — and avoids mistaking our own
    persistent Chrome for the user's "everyday Chrome is open" case.
    """
    global _context
    if _context is None:
        return None
    try:
        pages = _context.pages
        return pages[0] if pages else _context.new_page()
    except Exception:  # noqa: BLE001 — context died since last use
        _close_context()
        return None


def _try_screen_driver() -> _ScreenDriver | None:
    """Build an on-screen driver if Chrome is installed and PyAutoGUI is available."""
    chrome = _find_chrome_executable()
    if chrome is None:
        return None
    try:
        import pyautogui  # type: ignore[import-untyped]

        pyautogui.FAILSAFE = True
        pyautogui.PAUSE = 0.05
    except Exception:  # noqa: BLE001 — no screen control available here
        return None
    return _ScreenDriver(pyautogui, chrome)


def _acquire_driver() -> Any:
    """Choose how to drive the browser — always prefer the user's real Chrome on-screen.

    1. On-screen (default): ``chrome.exe <url>`` opens or reuses real Chrome with the
       user's profile — no Playwright, no "automated test software" banner, no
       ``about:blank`` stall. Works whether Chrome was already open or closed.
    2. Playwright CDP (fallback): only when on-screen control is unavailable or
       ``EXOSITES_WEB_AGENT_ISOLATED=1`` forces an isolated automation profile.

    :raises ChromeBusyError: on-screen unavailable but Chrome is running (rare).
    :raises ImportError: if Playwright is needed for fallback but not installed.
    """
    forced_isolated = os.environ.get(_ISOLATED_ENV, "").strip().lower() in ("1", "true", "yes")

    if not forced_isolated:
        screen = _try_screen_driver()
        if screen is not None:
            if _context is not None:
                logger.info("[web_agent] closing leftover automation window — using real Chrome")
                _close_context()
            if _user_chrome_running():
                logger.info("[web_agent] Chrome is open — driving your signed-in window on-screen")
            else:
                logger.info("[web_agent] Chrome was closed — opening your signed-in Chrome on-screen")
            return screen
        if _user_chrome_running():
            raise ChromeBusyError(_CHROME_BUSY_MESSAGE)

    page = _existing_page()
    if page is not None:
        return _PlaywrightDriver(page)

    return _PlaywrightDriver(_ensure_context())


def _web_agent_impl(
    task: str, max_steps: int, start_url: str, vis_id: str | None,
    auto_close_scope: str | None = None,
) -> dict[str, Any]:
    """Run one browser task end-to-end. MUST execute on the browser worker thread."""
    try:
        driver = _acquire_driver()
    except ImportError:
        return {"ok": False, "error": "playwright is not installed. pip install playwright && playwright install chromium"}
    except ChromeBusyError as exc:
        return {"ok": True, "data": {"status": "needs_user", "steps": 0, "log": [], "reason": str(exc)}}
    except Exception as exc:  # noqa: BLE001
        logger.exception("web_agent launch")
        return {"ok": False, "error": f"could not start the browser: {exc}"}

    logger.info("[web_agent] task=%r max_steps=%d start_url=%r", task[:120], max_steps, start_url[:120])
    _mirror(vis_id, "task_start", goal=task)
    _mirror(vis_id, "plan_ready", steps=[{"index": 1, "description": "Browsing the web", "subtasks": []}])
    _mirror(vis_id, "step_start", step=1, description="Opening the page")

    if not start_url:
        start_url = _infer_start_url(task)
        if start_url:
            logger.info("[web_agent] inferred start_url=%r from task", start_url)

    safe_start = normalize_public_web_url(start_url) if start_url else None
    if start_url and not safe_start:
        return {
            "ok": False,
            "error": "start_url must be a public http(s) address; local and private networks are blocked.",
        }

    # Never spin on about:blank — open the target before the first vision step.
    if safe_start:
        try:
            driver.perform({"type": "navigate", "url": safe_start})
        except Exception as exc:  # noqa: BLE001
            logger.warning("web_agent start_url navigation failed: %s", exc)
    elif driver.url in ("", "about:blank", "(blank)"):
        logger.warning("[web_agent] no start_url and page is blank — vision must navigate first")

    cancel = _register_active_cancel()
    result: dict[str, Any] = {"ok": False, "error": "the browser agent did not produce a result."}
    try:
        result = _run_browser_loop(
            driver, task, max_steps, time.monotonic() + OVERALL_DEADLINE_S, vis_id, cancel=cancel
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("web_agent loop")
        result = {"ok": False, "error": str(exc)}
    finally:
        _clear_active_cancel(cancel)
        _mirror_terminal(vis_id, result)
    _maybe_auto_close_tab(result, auto_close_scope)
    return result


def _maybe_auto_close_tab(result: dict[str, Any], scope: str | None) -> None:
    """Close the browser tab the agent opened, once a run finishes successfully.

    Only fires for an explicit ``done``/``extract`` result so we never close a tab
    while the user might still be signing in (``needs_user``) or after a cancel.
    """
    if scope != "tab":
        return
    data = result.get("data") if isinstance(result, dict) else None
    status = str(data.get("status") or "").strip().lower() if isinstance(data, dict) else ""
    if status != "done":
        return
    try:
        from actions.os_control import os_control

        os_control({"action": "close_browser", "browser": "chrome", "scope": "tab"})
        logger.info("[web_agent] auto-closed tab after successful run")
    except Exception:  # noqa: BLE001 — cleanup must never fail the result
        logger.debug("[web_agent] auto-close tab failed", exc_info=True)


def close_web_agent_sessions() -> None:
    """Release the persistent browser on the worker thread (app shutdown).

    Routes the teardown through the same worker that owns the Playwright objects so
    they are closed on their creating thread; a no-op if the worker never started.
    """
    executor = _browser_executor
    if executor is None:
        return
    try:
        executor.submit(_close_context).result(timeout=10)
    except Exception:  # noqa: BLE001 — teardown must never raise on shutdown
        logger.debug("web_agent close submit failed", exc_info=True)
