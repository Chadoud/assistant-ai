"""Shared OAuth navigation decision helpers (playbooks, vision budget, audit)."""

from __future__ import annotations

import base64
import logging
import threading
from typing import Any, Callable

from orchestrator.audit import record_action
from orchestrator.capabilities import Capability
from orchestrator.complete import CompletionError, complete
from orchestrator.conductor import candidates_for
from orchestrator.vision import VisionError, audit_relay_callback, vision_complete

logger = logging.getLogger(__name__)

MAX_VISION_PER_CONNECT = 8

_budget_lock = threading.Lock()
_vision_counts: dict[str, int] = {}


def reset_connect_vision_budget(connect_id: str) -> None:
    """Clear the vision-call counter for a connect session."""
    with _budget_lock:
        _vision_counts.pop(connect_id or "default", None)


def _connect_key(connect_id: str | None) -> str:
    return (connect_id or "default").strip() or "default"


def consume_vision_budget(connect_id: str | None) -> bool:
    """Return True if a vision call is allowed; increments the counter."""
    key = _connect_key(connect_id)
    with _budget_lock:
        count = _vision_counts.get(key, 0)
        if count >= MAX_VISION_PER_CONNECT:
            return False
        _vision_counts[key] = count + 1
        return True


def vision_budget_exhausted_action() -> dict[str, Any]:
    return {
        "type": "need_user",
        "ref": None,
        "value": None,
        "reason": (
            "I've used the automatic step limit for this connection — please finish the "
            "last consent click in the browser (Allow / Authorize), then I'll verify access."
        ),
    }


def decide_with_vision_or_text(
    *,
    connect_id: str | None,
    provider: str,
    goal: str,
    user_text: str,
    system_prompt: str,
    screenshot_b64: str | None,
    screenshot_mime: str = "image/jpeg",
    coerce_fn: Callable[[str], dict[str, Any]],
) -> dict[str, Any]:
    """Choose the next OAuth action using vision (if image + budget) or text completion."""
    if not candidates_for(Capability.VISION, require_vision=True) and not candidates_for(
        Capability.REASONING
    ):
        return {"ok": False, "error": "No AI provider configured for connect autopilot."}

    if isinstance(screenshot_b64, str) and screenshot_b64.strip():
        if not consume_vision_budget(connect_id):
            action = vision_budget_exhausted_action()
            record_action(
                "connect_autopilot",
                goal=goal,
                risk="safe",
                args={"provider": provider, "connect_id": _connect_key(connect_id)},
                outcome="vision_budget_exhausted",
            )
            return {"ok": True, "data": action}
        try:
            jpeg = base64.b64decode(screenshot_b64)
            raw = vision_complete(
                user_text,
                jpeg,
                mime_type=screenshot_mime,
                system=system_prompt,
                on_relay=audit_relay_callback(f"connect {provider}"),
            )
            record_action(
                "connect_autopilot",
                goal=goal,
                risk="safe",
                args={"provider": provider, "connect_id": _connect_key(connect_id), "mode": "vision"},
                outcome="decided",
            )
            return {"ok": True, "data": coerce_fn(raw)}
        except VisionError as exc:
            logger.warning("[nav_decision] vision failed: %s", exc)

    try:
        raw = complete(
            Capability.REASONING,
            system_prompt,
            user_text,
            on_relay=lambda src, dst, reason: record_action(
                "connect_autopilot",
                goal=goal,
                risk="safe",
                args={"from": src, "to": dst, "reason": reason[:120]},
                outcome="relayed",
            ),
            relay_kind="connect_autopilot",
        )
        record_action(
            "connect_autopilot",
            goal=goal,
            risk="safe",
            args={"provider": provider, "connect_id": _connect_key(connect_id), "mode": "text"},
            outcome="decided",
        )
        return {"ok": True, "data": coerce_fn(raw)}
    except CompletionError as exc:
        return {"ok": False, "error": str(exc)}
