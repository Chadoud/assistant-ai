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

# Explicit close codes that indicate a permanent client/config problem.
# 1007 (invalid frame payload) is used by Gemini Live for bad model/modality
# configs and invalid API keys — never treat as a flaky transport drop.
NON_TRANSIENT_LIVE_WS_CODES = frozenset({1002, 1003, 1007})

VOICE_AUDIO_CONFIG_USER_MESSAGE = (
    "Voice could not start: this Gemini model does not support Live audio. "
    "Use a native-audio Live model (or clear GEMINI_VOICE_MODEL), then turn the mic off and on."
)


def _walk_exception_chain(exc: BaseException) -> list[BaseException]:
    seen: set[int] = set()
    out: list[BaseException] = []
    cursor: BaseException | None = exc
    while cursor is not None and id(cursor) not in seen:
        seen.add(id(cursor))
        out.append(cursor)
        cursor = cursor.__cause__ or cursor.__context__
    return out


def is_quota_exhausted_error(exc: Exception) -> bool:
    """Return True when the exception chain indicates a free-tier quota cap."""
    from orchestrator.quota_notice import is_free_tier_quota_error

    for cursor in _walk_exception_chain(exc):
        if is_free_tier_quota_error(str(cursor)):
            return True
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


def is_live_audio_config_error(exc: BaseException | str) -> bool:
    """Return True when Gemini Live rejected AUDIO for the connected model."""
    low = str(exc).lower()
    return (
        "content_type_audio" in low
        or "audio content type" in low
        or (
            "not supported for this model configuration" in low
            and "audio" in low
        )
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

    Explicit close codes outside the transient set (notably 1007 for bad Live
    model/audio config) are never treated as flaky transport, even when the
    exception type name contains ``websocket`` / ``connectionclosed``.
    """
    if is_live_audio_config_error(exc):
        return False

    chain = _walk_exception_chain(exc)

    for cursor in chain:
        code = getattr(cursor, "code", None)
        if isinstance(code, int):
            if code in NON_TRANSIENT_LIVE_WS_CODES or is_live_audio_config_error(cursor):
                return False
            if code in TRANSIENT_LIVE_WS_CODES:
                return True
            # Unknown but explicit close code — do not guess via type-name heuristics.
            return False

    for cursor in chain:
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

    return False
