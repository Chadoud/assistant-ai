"""Classify voice session errors as fatal auth failures vs recoverable transport drops."""

from __future__ import annotations

import asyncio

# WebSocket close codes that are transient / server-side and should be retried.
#   1001 going away · 1006 abnormal closure (no close frame — transport died) ·
#   1008 policy violation · 1011 server error · 1012 service restart ·
#   1013 try again later · 1014 bad gateway.
# 1006 in particular is what surfaces when the OS kills the socket (e.g. Windows
# WinError 121 semaphore timeout) — always a recoverable transport drop.
TRANSIENT_LIVE_WS_CODES = frozenset({1001, 1006, 1008, 1011, 1012, 1013, 1014})


def is_quota_exhausted_error(exc: Exception) -> bool:
    """Return True when the exception chain indicates a free-tier quota cap."""
    from orchestrator.quota_notice import is_free_tier_quota_error

    seen: set[int] = set()
    cursor: BaseException | None = exc
    while cursor is not None and id(cursor) not in seen:
        seen.add(id(cursor))
        if is_free_tier_quota_error(str(cursor)):
            return True
        cursor = cursor.__cause__ or cursor.__context__
    return False


def is_api_key_error(msg: str) -> bool:
    """Return True for auth failures that should not be retried."""
    low = msg.lower()
    return (
        "1007" in msg and ("api key" in low or "api_key" in low)
        or "api key not valid" in low
        or "invalid api key" in low
        or "api_key_invalid" in low
        or "gemini_api_key not configured" in low
        or "please pass a valid api key" in low
    )


def is_transient_connection_error(exc: Exception) -> bool:
    """Return True for network/connection failures that should be retried.

    Covers Gemini Live's transient WS close codes (see ``TRANSIENT_LIVE_WS_CODES``)
    plus the family of low-level network errors seen on weak connections: abnormal
    closures (1006), handshake timeouts, reset or aborted sockets, DNS failures,
    transient 5xx server closes, and OS socket timeouts (e.g. Windows WinError 121).
    These are all recoverable by reconnecting with backoff and the session-resumption
    handle.

    The genai SDK raises an ``APIError`` whose ``__cause__`` is the real socket
    error, so the whole cause chain is inspected — not just the outermost wrapper.
    """
    seen: set[int] = set()
    cursor: BaseException | None = exc
    while cursor is not None and id(cursor) not in seen:
        seen.add(id(cursor))

        code = getattr(cursor, "code", None)
        if isinstance(code, int) and code in TRANSIENT_LIVE_WS_CODES:
            return True
        # Windows surfaces dead sockets as OSError WinError 121 (semaphore timeout).
        if isinstance(cursor, (asyncio.TimeoutError, TimeoutError, ConnectionError, OSError)):
            return True

        # websockets.exceptions.* and similar library errors — match by type name
        # so we do not need to import the library to reference its exception types.
        type_name = type(cursor).__name__.lower()
        if any(
            token in type_name
            for token in ("timeout", "connectionclosed", "connectionerror", "websocket")
        ):
            return True

        low = str(cursor).lower()
        if any(
            token in low
            for token in (
                "timed out", "timeout", "handshake", "deadline expired",
                "abnormal closure", "going away", "service restart", "try again later",
                "connection reset", "connection closed", "connection aborted",
                "no close frame", "semaphore timeout", "winerror 121",
                "temporarily unavailable", "503", "502", "504",
                "name resolution", "getaddrinfo", "network is unreachable",
            )
        ):
            return True

        cursor = cursor.__cause__ or cursor.__context__

    return False
