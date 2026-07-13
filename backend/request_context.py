"""Request-scoped correlation id for structured logs."""

from __future__ import annotations

from contextvars import ContextVar

_request_id: ContextVar[str | None] = ContextVar("request_id", default=None)


def set_request_id(value: str) -> None:
    """Bind the active HTTP request id for downstream log helpers."""
    _request_id.set(value)


def get_request_id() -> str | None:
    """Return the current request id when inside HTTP middleware."""
    return _request_id.get()


def clear_request_id() -> None:
    """Reset after the request completes."""
    _request_id.set(None)
