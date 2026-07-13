"""Autonomous computer-use agent: see the screen, decide, act — for any app.

Gives the assistant general control of the computer to carry out a high-level task
(e.g. "open Settings and turn on dark mode", "fill this form", "complete the consent
screen"). Each step it screenshots the screen, asks a vision model for the single
next action, and performs it with PyAutoGUI — looping until the task is done.

Both capture and input go through PyAutoGUI, so they share one coordinate space
(no physical/logical DPI mismatch). Guardrails:
  - Bounded steps + per-run wall-clock deadline (can't spin forever).
  - PyAutoGUI fail-safe is on: slam the mouse into a screen corner to abort.
  - Never types credentials: a sign-in / 2FA / password / captcha screen stops the
    run with status ``needs_user`` so the human takes over.
  - Refuses irreversible/destructive/financial actions unless the task explicitly
    asks for them (returns ``needs_user``).
"""

from __future__ import annotations

import io
import json
import logging
import re
import time
from typing import Any

from actions.credential_guard import enforce_credential_guard
from orchestrator.capabilities import Capability
from orchestrator.conductor import candidates_for
from orchestrator.health import is_transient_error
from orchestrator.vision import VisionError, audit_relay_callback, vision_complete

logger = logging.getLogger(__name__)

MAX_STEPS_CAP = 30
DEFAULT_MAX_STEPS = 20
OVERALL_DEADLINE_S = 180
STEP_PAUSE_S = 0.6

# Actions the agent may take. "click"-family + "move" carry normalized coords.
_POINT_ACTIONS = {"click", "double_click", "right_click", "move"}
_ALL_ACTIONS = _POINT_ACTIONS | {"type", "key", "scroll", "wait", "done", "needs_user", "fail"}

_SYSTEM_PROMPT = (
    "You control a real computer to accomplish the user's task. Each turn you get a "
    "screenshot of the whole screen and the task; decide the SINGLE next action.\n\n"
    "Coordinates: give x and y as fractions (0..1) of the screenshot width/height at "
    "the CENTER of the target.\n\n"
    "Actions:\n"
    "- click / double_click / right_click {x,y}: mouse actions at a point.\n"
    "- move {x,y}: move the cursor (rarely needed).\n"
    "- type {text}: type text into the focused field (click it first).\n"
    "- key {keys:[...]}: press a key or chord, e.g. [\"enter\"], [\"ctrl\",\"a\"], [\"win\"].\n"
    "- scroll {amount}: positive scrolls up, negative scrolls down.\n"
    "- wait: the screen is loading / nothing actionable yet.\n"
    "- done: the task is complete.\n"
    "- needs_user: a human must take over (sign-in, password, 2FA, captcha, or a "
    "risky/irreversible/financial confirmation the task did not explicitly request).\n"
    "- fail: the task cannot be done from this screen.\n\n"
    "Rules: NEVER type passwords/2FA codes (use needs_user). NEVER perform destructive "
    "or paid actions unless the task explicitly says so. Prefer the safe, obvious path.\n\n"
    "Set \"sensitive\": true whenever the current screen is a password, passcode, 2FA / "
    "one-time-code, or captcha entry — even if you intend to wait. The host enforces this: "
    "a type action on a sensitive screen is refused and control is handed to the user.\n\n"
    "OAuth / app-authorization consent screens are EXPECTED and SAFE to complete — do NOT "
    "use needs_user for them (only for an actual password/2FA/captcha login). Click through "
    "every step until access is granted. If the screen asks to pick what to share before the "
    "grant button works (e.g. Notion 'Select pages' / 'Sélectionner des pages'): first SELECT a "
    "page/workspace — click the page-group row (e.g. 'Pages privées'), its checkbox, or 'Select "
    "all' — THEN click the final grant button ('Allow access' / 'Donner l'accès' / 'Authorize' / "
    "'Confirm'). If the grant button looks enabled, you may click it directly. Use 'done' only "
    "after the consent screen has closed / redirected (e.g. a success or localhost page), not "
    "while the picker is still showing.\n\n"
    "Respond with ONLY JSON: {\"type\": <action>, \"x\": <0..1|null>, \"y\": <0..1|null>, "
    "\"text\": <string|null>, \"keys\": <array|null>, \"amount\": <int|null>, "
    "\"sensitive\": <true|false>, \"reason\": <short reason>}."
)


def _require_pyautogui():
    import pyautogui  # type: ignore[import-untyped]

    pyautogui.FAILSAFE = True
    pyautogui.PAUSE = 0.05
    return pyautogui


def _screenshot_jpeg(pg: Any) -> tuple[bytes, int, int]:
    img = pg.screenshot().convert("RGB")
    width, height = img.size
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=70)
    return buf.getvalue(), width, height


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


def _history_loop_detected(history: list[str], action: dict[str, Any]) -> bool:
    """True when the same action type+reason repeats too often (stuck loop)."""
    if len(history) < 2:
        return False
    reason = str(action.get("reason") or action.get("type") or "").strip().lower()
    atype = str(action.get("type") or "").strip().lower()
    if not reason or atype in ("wait", "done", "needs_user", "fail"):
        return False
    recent = history[-3:]
    same_type = sum(1 for entry in recent if entry.lower().startswith(f"{atype}:"))
    if same_type >= 2:
        return True
    stem = reason[:24]
    if stem and sum(1 for entry in recent if stem in entry.lower()) >= 2:
        return True
    return False


def _decide_action(task: str, history: list[str], jpeg: bytes) -> dict[str, Any]:
    """Ask the vision relay (Gemini → OpenAI → Claude) for the next action.

    :raises VisionError: if every configured vision provider is unavailable.
    """
    recent = "\n".join(f"- {h}" for h in history[-8:]) if history else "(none)"
    user_text = f"Task: {task}\nSteps so far:\n{recent}"
    raw = vision_complete(
        user_text, jpeg, mime_type="image/jpeg", system=_SYSTEM_PROMPT,
        on_relay=audit_relay_callback(f"control_computer: {task[:120]}"),
    )
    parsed = _extract_json(raw)
    if not isinstance(parsed, dict):
        return {"type": "wait", "reason": "unparseable model output"}
    action_type = str(parsed.get("type") or "").strip().lower()
    if action_type not in _ALL_ACTIONS:
        return {"type": "wait", "reason": f"unknown action {action_type!r}"}
    parsed["type"] = action_type
    return parsed


def _perform(pg: Any, action: dict[str, Any], width: int, height: int) -> str | None:
    """Execute one action via PyAutoGUI. Returns an error string, or None on success."""
    atype = action["type"]
    if atype in _POINT_ACTIONS:
        x, y = _clamp01(action.get("x")), _clamp01(action.get("y"))
        if x is None or y is None:
            return None  # missing coords — skip this step rather than click blindly.
        px, py = int(x * width), int(y * height)
        if atype == "click":
            pg.click(px, py)
        elif atype == "double_click":
            pg.doubleClick(px, py)
        elif atype == "right_click":
            pg.click(px, py, button="right")
        else:  # move
            pg.moveTo(px, py)
        return None
    if atype == "type":
        pg.typewrite(str(action.get("text") or ""), interval=0.02)
        return None
    if atype == "key":
        keys = action.get("keys")
        if isinstance(keys, list) and keys:
            pg.hotkey(*[str(k).lower() for k in keys])
        return None
    if atype == "scroll":
        try:
            amount = int(action.get("amount") or -3)
        except (TypeError, ValueError):
            amount = -3
        pg.scroll(amount)
        return None
    return None


def control_computer(parameters: dict[str, Any]) -> dict[str, Any]:
    """Autonomously operate the computer to accomplish a task.

    :param parameters: ``task`` (required, plain-language goal) and optional
        ``max_steps`` (1..30, default 20).
    :returns: ``{ok, data: {status, steps, log}}`` where ``status`` is one of
        ``done | needs_user | incomplete | failed``; or ``{ok: False, error}``.
    """
    task = str(parameters.get("task", "")).strip()
    if not task:
        return {"ok": False, "error": "task is required (describe what to do on screen)."}

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

    try:
        pg = _require_pyautogui()
    except ImportError:
        return {"ok": False, "error": "pyautogui is not installed. pip install pyautogui"}

    logger.info("[computer_use] task=%r max_steps=%d", task[:120], max_steps)
    history: list[str] = []
    deadline = time.monotonic() + OVERALL_DEADLINE_S
    step = 0

    while step < max_steps:
        if time.monotonic() > deadline:
            return {"ok": True, "data": {"status": "incomplete", "steps": step, "log": history,
                                         "reason": "time limit reached"}}
        try:
            jpeg, width, height = _screenshot_jpeg(pg)
        except Exception as exc:  # noqa: BLE001
            logger.exception("computer_use screenshot")
            return {"ok": False, "error": f"screen capture failed: {exc}"}

        try:
            action = _decide_action(task, history, jpeg)
        except VisionError as exc:
            # Every vision provider relayed and still failed. If it's a transient
            # exhaustion (all providers rate-limited/overloaded), hand back so the
            # user can finish the on-screen step; otherwise surface the real error.
            message = str(exc)
            if is_transient_error(message):
                logger.info("[computer_use] all vision providers throttled; handing back to user")
                return {"ok": True, "data": {
                    "status": "needs_user", "steps": step, "log": history,
                    "reason": (
                        "The on-screen vision models are all busy right now. Please finish "
                        "in the browser: if it asks, select your pages, then click Allow / "
                        "Donner l'accès — the connection completes itself once you approve."
                    ),
                }}
            logger.warning("computer_use decide failed: %s", message)
            return {"ok": False, "error": message}
        except Exception as exc:  # noqa: BLE001
            logger.warning("computer_use decide failed: %s", exc)
            return {"ok": False, "error": str(exc)}

        step += 1

        action = enforce_credential_guard(action)
        if _history_loop_detected(history, action):
            reason = (
                "Stuck repeating the same on-screen action — please finish this step manually "
                "(for Google unverified apps: Advanced → Go to app (unsafe) → Allow)."
            )
            return {"ok": True, "data": {"status": "needs_user", "steps": step,
                                         "log": history, "reason": reason}}
        reason = str(action.get("reason") or action["type"])
        history.append(f"{action['type']}: {reason}")
        logger.info("[computer_use] step %d: %s (%s)", step, action["type"], reason)

        if action["type"] == "done":
            return {"ok": True, "data": {"status": "done", "steps": step, "log": history}}
        if action["type"] == "needs_user":
            return {"ok": True, "data": {"status": "needs_user", "steps": step,
                                         "log": history, "reason": reason}}
        if action["type"] == "fail":
            return {"ok": True, "data": {"status": "failed", "steps": step,
                                         "log": history, "reason": reason}}
        if action["type"] == "wait":
            time.sleep(STEP_PAUSE_S * 2)
            continue

        try:
            err = _perform(pg, action, width, height)
        except Exception as exc:  # noqa: BLE001
            logger.exception("computer_use perform")
            return {"ok": False, "error": f"action failed: {exc}"}
        if err:
            return {"ok": False, "error": err}
        time.sleep(STEP_PAUSE_S)

    return {"ok": True, "data": {"status": "incomplete", "steps": max_steps, "log": history,
                                 "reason": "step limit reached"}}
