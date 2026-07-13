"""Decide the next browser action on an OAuth consent page (the AI self-connect brain).

The Electron main process owns an app-controlled browser window during a connect
flow. For each page it captures a compact list of interactive elements (plus an
optional screenshot) and asks this module what to do next. We return exactly ONE
action referencing an element by its ``ref``.

Safety is enforced here, not in the prompt alone: credential/OTP fields and
captcha-like states always yield ``need_user`` so a human takes over, and we never
emit a destructive choice (Cancel/Deny). The caller is responsible for executing
the action and for the OAuth callback/token exchange.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from actions.credential_guard import is_secret_field as _shared_is_secret_field
from actions.nav_decision import decide_with_vision_or_text
from actions.oauth_playbooks import try_playbook_web

logger = logging.getLogger(__name__)

ACTION_TYPES = ("click", "type", "select", "wait", "need_user", "done")

# Accessible-name hints that mean "do not click" (deny / cancel paths).
_DENY_HINTS = (
    "cancel",
    "deny",
    "decline",
    "reject",
    "annuler",
    "refuser",
    "abbrechen",
    "ablehnen",
)

_SYSTEM_PROMPT = (
    "You drive a browser to finish an OAuth connection on the user's behalf. "
    "You are given the page URL, the goal, and a numbered list of interactive "
    "elements (each with a ref, role, name, text, and type). Decide the SINGLE "
    "next action that moves toward authorizing/approving the connection.\n\n"
    "Rules (hard):\n"
    "- NEVER type into password, passcode, OTP, or 2FA fields. If the page asks "
    "to sign in or for a verification code, return need_user.\n"
    "- If a captcha or human-verification challenge is present, return need_user.\n"
    "- NEVER click Cancel, Deny, Decline, Reject (or their translations).\n"
    "- Prefer buttons/links like Authorize, Allow, Approve, Connect, Continue, "
    "Select pages, Confirm, Accept. For Notion 'select pages', choose the option "
    "that selects pages then confirm.\n"
    "- If the page is still loading or nothing actionable is present yet, return wait.\n"
    "- When the authorize/approve button has been clicked and a redirect is "
    "expected, return done.\n\n"
    "Respond with ONLY a JSON object: "
    '{"type": one of '
    '["click","type","select","wait","need_user","done"], '
    '"ref": <int element ref or null>, "value": <string or null>, '
    '"reason": <short plain-language reason>}.'
)


def _normalize_name(element: dict[str, Any]) -> str:
    return " ".join(
        str(element.get(field) or "")
        for field in ("name", "text", "ariaLabel", "placeholder")
    ).lower()


def _is_secret_field(element: dict[str, Any]) -> bool:
    return _shared_is_secret_field(_normalize_name(element), element.get("type"))


def _element_by_ref(elements: list[dict[str, Any]], ref: Any) -> dict[str, Any] | None:
    try:
        target = int(ref)
    except (TypeError, ValueError):
        return None
    for element in elements:
        if element.get("ref") == target:
            return element
    return None


def _elements_for_prompt(elements: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for element in elements:
        ref = element.get("ref")
        role = element.get("role") or element.get("tag") or "element"
        name = (element.get("name") or element.get("text") or "").strip()
        etype = element.get("type") or ""
        suffix = f" type={etype}" if etype else ""
        lines.append(f"[{ref}] {role}: {name!r}{suffix}")
    return "\n".join(lines) if lines else "(no interactive elements found)"


def _coerce_action(raw: Any, elements: list[dict[str, Any]]) -> dict[str, Any]:
    """Validate the model's action and apply hard safety overrides."""
    if not isinstance(raw, dict):
        return {"type": "wait", "ref": None, "value": None, "reason": "unparseable model output"}

    action_type = str(raw.get("type") or "").strip().lower()
    if action_type not in ACTION_TYPES:
        return {"type": "wait", "ref": None, "value": None, "reason": f"unknown action {action_type!r}"}

    ref = raw.get("ref")
    value = raw.get("value")
    reason = str(raw.get("reason") or "").strip() or action_type
    element = _element_by_ref(elements, ref)

    # Safety: never type a secret; hand control to the user.
    if action_type == "type" and element is not None and _is_secret_field(element):
        return {
            "type": "need_user",
            "ref": None,
            "value": None,
            "reason": "Sign-in / verification field detected — handing over to you.",
        }

    # Safety: never follow a deny/cancel path.
    if action_type == "click" and element is not None:
        if any(hint in _normalize_name(element) for hint in _DENY_HINTS):
            return {
                "type": "wait",
                "ref": None,
                "value": None,
                "reason": "refused to click a cancel/deny control",
            }

    # An actionable type must reference a real element.
    if action_type in ("click", "type", "select") and element is None:
        return {"type": "wait", "ref": None, "value": None, "reason": "referenced element not found"}

    return {"type": action_type, "ref": element.get("ref") if element else None, "value": value, "reason": reason}


def _extract_json(text: str) -> Any:
    text = text.strip()
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return None


def decide_next_action(payload: dict[str, Any]) -> dict[str, Any]:
    """Choose the next browser action for an OAuth consent page.

    :param payload: ``provider`` (str), ``goal`` (str), ``url`` (str),
        ``elements`` (list of interactive-element dicts with an int ``ref``),
        ``screenshot_b64`` (optional JPEG/PNG base64), ``history`` (optional list
        of prior reasons).
    :returns: ``{ok, data: {type, ref, value, reason}}`` or ``{ok: False, error}``.
    """
    elements = payload.get("elements") or []
    if not isinstance(elements, list):
        return {"ok": False, "error": "elements must be a list"}

    provider = str(payload.get("provider") or "the service")
    goal = str(payload.get("goal") or f"Authorize and connect {provider}.")
    url = str(payload.get("url") or "")
    history = payload.get("history") or []

    playbook = try_playbook_web(
        url=url,
        elements=elements,
        history=history if isinstance(history, list) else [],
        provider=provider,
    )
    if playbook is not None:
        logger.info("[web_nav] playbook %s reason=%s", playbook["type"], playbook.get("reason"))
        return {"ok": True, "data": playbook}

    history_text = "\n".join(f"- {h}" for h in history[-6:]) if isinstance(history, list) else ""

    user_text = (
        f"Provider: {provider}\n"
        f"Goal: {goal}\n"
        f"URL: {url}\n"
        f"Recent steps:\n{history_text or '(none)'}\n\n"
        f"Interactive elements:\n{_elements_for_prompt(elements)}"
    )

    connect_id = str(payload.get("connect_id") or "").strip() or None
    screenshot_b64 = payload.get("screenshot_b64")
    screenshot_mime = str(payload.get("screenshot_mime") or "image/jpeg")

    result = decide_with_vision_or_text(
        connect_id=connect_id,
        provider=provider,
        goal=goal,
        user_text=user_text,
        system_prompt=_SYSTEM_PROMPT,
        screenshot_b64=screenshot_b64 if isinstance(screenshot_b64, str) else None,
        screenshot_mime=screenshot_mime,
        coerce_fn=lambda raw: _coerce_action(_extract_json(raw), elements),
    )
    if not result.get("ok"):
        return result
    action = result["data"]
    logger.info("[web_nav] %s ref=%s reason=%s", action["type"], action.get("ref"), action.get("reason"))
    return {"ok": True, "data": action}
