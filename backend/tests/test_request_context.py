"""Tests for request correlation context."""

from __future__ import annotations

from request_context import clear_request_id, get_request_id, set_request_id


def test_request_context_roundtrip() -> None:
    clear_request_id()
    assert get_request_id() is None
    set_request_id("abc123")
    assert get_request_id() == "abc123"
    clear_request_id()
    assert get_request_id() is None
