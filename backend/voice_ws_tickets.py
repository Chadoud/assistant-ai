"""Short-lived one-shot tickets for voice WebSocket app_auth (M2.3).

Renderer never holds EXOSITES_APP_TOKEN; Electron main mints a ticket over HTTP
and the voice client sends it as the first-frame app_auth token.
"""

from __future__ import annotations

import secrets
import threading
import time

_LOCK = threading.Lock()
_TICKETS: dict[str, float] = {}
_TTL_S = 60.0


def mint_voice_ws_ticket(*, ttl_s: float = _TTL_S) -> str:
    ticket = secrets.token_urlsafe(32)
    expires = time.time() + max(5.0, float(ttl_s))
    with _LOCK:
        # Bound memory if mint is abused.
        if len(_TICKETS) > 256:
            now = time.time()
            for k, exp in list(_TICKETS.items()):
                if exp < now:
                    del _TICKETS[k]
        _TICKETS[ticket] = expires
    return ticket


def consume_voice_ws_ticket(ticket: str | None) -> bool:
    if not ticket or not str(ticket).strip():
        return False
    key = str(ticket).strip()
    with _LOCK:
        exp = _TICKETS.pop(key, None)
    if exp is None:
        return False
    return time.time() <= exp
