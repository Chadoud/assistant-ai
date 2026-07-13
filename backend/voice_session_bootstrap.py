"""Session-scoped voice bootstrap state primed by Electron main over HTTP."""

from __future__ import annotations

import threading
from typing import Any

from provider_context import ProviderContext, provider_context_from_payload

_lock = threading.Lock()
_provider_by_session: dict[str, ProviderContext] = {}


def prime_voice_session_provider(session_id: str, payload: dict[str, Any]) -> None:
    """Store provider context for an upcoming /ws/voice connection."""
    sid = (session_id or "").strip()
    if not sid:
        return
    ctx = provider_context_from_payload(payload)
    with _lock:
        if ctx is None:
            _provider_by_session.pop(sid, None)
        else:
            _provider_by_session[sid] = ctx


def consume_voice_session_provider(session_id: str | None) -> ProviderContext | None:
    """Return and remove primed provider context for this voice session."""
    sid = (session_id or "").strip()
    if not sid:
        return None
    with _lock:
        return _provider_by_session.pop(sid, None)
