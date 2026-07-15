"""Rate-limit unauthenticated / failed voice WebSocket handshakes (M2.10)."""

from __future__ import annotations

import threading
import time

_LOCK = threading.Lock()
_FAILURES: dict[str, list[float]] = {}
_WINDOW_S = 60.0
_MAX_FAILURES = 30


def _client_key(host: str | None) -> str:
    return (host or "unknown").strip() or "unknown"


def voice_ws_auth_allowed(host: str | None) -> bool:
    """False when this client has too many recent auth failures."""
    key = _client_key(host)
    now = time.time()
    with _LOCK:
        stamps = [t for t in _FAILURES.get(key, []) if now - t < _WINDOW_S]
        _FAILURES[key] = stamps
        return len(stamps) < _MAX_FAILURES


def record_voice_ws_auth_failure(host: str | None) -> None:
    key = _client_key(host)
    now = time.time()
    with _LOCK:
        stamps = [t for t in _FAILURES.get(key, []) if now - t < _WINDOW_S]
        stamps.append(now)
        _FAILURES[key] = stamps
