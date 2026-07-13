"""Privacy-safe structured logging for voice WebSocket sessions."""

from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

_SECRET_FIELD_KEYS = frozenset(
    {
        "api_key",
        "apikey",
        "token",
        "access_token",
        "refresh_token",
        "password",
        "secret",
        "authorization",
        "credential",
        "private_key",
    }
)
_REDACTED = "[REDACTED]"


def _looks_like_secret_key(key: str) -> bool:
    lowered = key.lower().replace("-", "_")
    return any(part in lowered for part in _SECRET_FIELD_KEYS)


def _redact_value(value: object) -> object:
    if isinstance(value, dict):
        return {
            k: _REDACTED if _looks_like_secret_key(str(k)) else _redact_value(v)
            for k, v in value.items()
        }
    if isinstance(value, list):
        return [_redact_value(item) for item in value]
    if isinstance(value, str) and len(value) > 8:
        if value.startswith("Bearer ") or value.startswith("sk-") or value.startswith("AIza"):
            return _REDACTED
    return value


def _normalize_session_id(session_id: str | None) -> str:
    """Return a bounded session id for logs (never empty)."""
    if not session_id or not str(session_id).strip():
        return "unknown"
    return str(session_id).strip()[:36]


def log_voice_event(session_id: str | None, event: str, **fields: Any) -> None:
    """Emit one voice lifecycle log line with secret fields redacted.

    Args:
        session_id: Client-supplied correlation id (or None).
        event: Short event name, e.g. ``connect`` or ``disconnect``.
        **fields: Extra structured fields (tokens/keys are masked).
    """
    safe_fields = _redact_value(fields)
    payload: dict[str, object] = {
        "event": event,
        "session_id": _normalize_session_id(session_id),
    }
    if isinstance(safe_fields, dict):
        payload.update(safe_fields)
    logger.info("[voice] %s", json.dumps(payload, ensure_ascii=False, default=str))
