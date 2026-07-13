"""Locate the next on-screen action for OS-level connect autopilot.

Unlike ``web_navigator`` (which reads the DOM of an app-controlled browser), this
captures the real desktop with ``mss`` and asks a vision model where to click — so
the AI can drive the user's REAL, already-logged-in Chrome by moving the actual
mouse. It returns one action with the click point normalized to the screenshot,
plus the screen size so the caller can map it to physical pixels.

Safety mirrors ``web_navigator``: sign-in / 2FA / captcha screens return
``need_user`` (we never simulate typing a password), and we never target a
Cancel/Deny control.
"""

from __future__ import annotations

import io
import logging
import re
from typing import Any

from actions.nav_decision import consume_vision_budget, vision_budget_exhausted_action
from actions.oauth_playbooks import try_playbook_desktop
from orchestrator.capabilities import Capability
from orchestrator.conductor import candidates_for
from orchestrator.health import is_transient_error, parse_retry_after
from orchestrator.vision import VisionError, audit_relay_callback, vision_complete

logger = logging.getLogger(__name__)

ACTION_TYPES = ("click", "wait", "need_user", "done")

_SYSTEM_PROMPT = (
    "You control the mouse to finish an OAuth connection in a real Chrome window on "
    "the user's screen. You are given a screenshot of the whole screen and the goal. "
    "Decide the SINGLE next action.\n\n"
    "Rules (hard):\n"
    "- If a sign-in, password, verification/2FA code, or captcha is shown, return "
    "need_user (the human must type credentials themselves).\n"
    "- NEVER click Cancel, Deny, Decline, Reject (or their translations).\n"
    "- Prefer the button that advances the consent: Authorize, Allow, Approve, "
    "Connect, Continue, Select pages, Confirm, Accept.\n"
    "- If the page is still loading or the consent UI is not visible yet, return wait.\n"
    "- When the connection looks finished (a success/'you can close this tab' page or "
    "the consent window is gone), return done.\n\n"
    "For a click, give x and y as fractions of the screenshot width/height (0..1) at "
    "the CENTER of the target control.\n"
    "Respond with ONLY JSON: "
    '{"type": one of ["click","wait","need_user","done"], '
    '"x": <0..1 or null>, "y": <0..1 or null>, '
    '"reason": <short plain-language reason>}.'
)


def _capture_primary_screen() -> tuple[bytes, int, int]:
    """Return (jpeg_bytes, width, height) for the primary monitor."""
    import mss  # type: ignore[import-untyped]
    from mss import tools as mss_tools  # noqa: F401  (kept for parity / future use)
    from PIL import Image

    with mss.mss() as sct:
        monitor = sct.monitors[1]
        shot = sct.grab(monitor)
        img = Image.frombytes("RGB", shot.size, shot.rgb)
    width, height = img.size
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=70)
    return buf.getvalue(), width, height


def _extract_json(text: str) -> Any:
    text = (text or "").strip()
    if not text:
        return None
    try:
        return __import__("json").loads(text)
    except Exception:  # noqa: BLE001
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            return None
        try:
            return __import__("json").loads(match.group(0))
        except Exception:  # noqa: BLE001
            return None


def _coerce(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {"type": "wait", "x": None, "y": None, "reason": "unparseable model output"}
    action_type = str(raw.get("type") or "").strip().lower()
    if action_type not in ACTION_TYPES:
        return {"type": "wait", "x": None, "y": None, "reason": f"unknown action {action_type!r}"}
    reason = str(raw.get("reason") or "").strip() or action_type
    if action_type != "click":
        return {"type": action_type, "x": None, "y": None, "reason": reason}

    def _frac(value: Any) -> float | None:
        try:
            f = float(value)
        except (TypeError, ValueError):
            return None
        return min(max(f, 0.0), 1.0)

    x, y = _frac(raw.get("x")), _frac(raw.get("y"))
    if x is None or y is None:
        return {"type": "wait", "x": None, "y": None, "reason": "click without coordinates"}
    return {"type": "click", "x": x, "y": y, "reason": reason}


def decide_next_desktop_action(payload: dict[str, Any]) -> dict[str, Any]:
    """Capture the screen and choose the next OS-level action.

    :param payload: ``provider``/``label`` (str), ``goal`` (str), ``history`` (list[str]).
    :returns: ``{ok, data: {type, x, y, reason}, screen: {width, height}}`` or ``{ok: False, error}``.
    """
    if not candidates_for(Capability.VISION, require_vision=True):
        return {"ok": False, "error": (
            "No vision-capable AI provider is configured. Add a Gemini, OpenAI, or "
            "Anthropic key in Settings -> AI Provider."
        )}

    try:
        jpeg_bytes, width, height = _capture_primary_screen()
    except ImportError as exc:
        return {"ok": False, "error": f"mss/Pillow required: {exc}"}
    except Exception as exc:  # noqa: BLE001
        logger.exception("desktop capture")
        return {"ok": False, "error": f"screen capture failed: {exc}"}

    label = str(payload.get("label") or payload.get("provider") or "the service")
    goal = str(payload.get("goal") or f"Finish authorizing and connecting {label}.")
    history = payload.get("history") or []
    history_list = history if isinstance(history, list) else []

    playbook = try_playbook_desktop(
        history=history_list,
        url=str(payload.get("url") or ""),
        screen_text=str(payload.get("screen_text") or ""),
        provider=label,
    )
    if playbook is not None:
        logger.info("[desktop_nav] playbook %s reason=%s", playbook["type"], playbook.get("reason"))
        return {
            "ok": True,
            "data": playbook,
            "screen": {"width": width, "height": height},
        }

    history_text = "\n".join(f"- {h}" for h in history_list[-6:]) if history_list else ""
    user_text = f"Goal: {goal}\nProvider: {label}\nRecent steps:\n{history_text or '(none)'}"

    try:
        connect_id = str(payload.get("connect_id") or "").strip() or None
        if not consume_vision_budget(connect_id):
            action = vision_budget_exhausted_action()
            action["type"] = "need_user"
            return {
                "ok": True,
                "data": action,
                "screen": {"width": width, "height": height},
            }
        raw = vision_complete(
            user_text, jpeg_bytes, mime_type="image/jpeg", system=_SYSTEM_PROMPT,
            on_relay=audit_relay_callback(f"connect {label}"),
        )
    except VisionError as exc:
        message = str(exc)
        # All vision providers exhausted. If it's transient (every engine throttled),
        # tell the autopilot loop to pause and retry; otherwise surface the error.
        if is_transient_error(message):
            retry_after = parse_retry_after(message) or 20.0
            logger.info("[desktop_nav] all vision providers busy; waiting %.0fs", retry_after)
            return {
                "ok": True,
                "data": {
                    "type": "wait",
                    "x": None,
                    "y": None,
                    "reason": f"All vision models busy — waiting {int(retry_after)}s, then continuing.",
                },
                "screen": {"width": width, "height": height},
                "retry_after": retry_after,
            }
        logger.warning("desktop_navigator decision failed: %s", message)
        return {"ok": False, "error": message}

    action = _coerce(_extract_json(raw))
    logger.info("[desktop_nav] %s reason=%s", action["type"], action.get("reason"))
    return {"ok": True, "data": action, "screen": {"width": width, "height": height}}
