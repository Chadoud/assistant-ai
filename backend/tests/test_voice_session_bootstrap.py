"""Tests for voice session bootstrap priming."""

from __future__ import annotations

from voice_session_bootstrap import (
    consume_voice_session_provider,
    prime_voice_session_provider,
)


def test_prime_and_consume_voice_session_provider() -> None:
    prime_voice_session_provider(
        "sess-1",
        {"provider": "openai", "model": "gpt-4o", "api_key": "sk-test", "base_url": ""},
    )
    ctx = consume_voice_session_provider("sess-1")
    assert ctx is not None
    assert ctx.preferred == "openai"
    assert ctx.preferred_model == "gpt-4o"
    assert ctx.preferred_api_key == "sk-test"
    assert consume_voice_session_provider("sess-1") is None


def test_consume_unknown_session_returns_none() -> None:
    assert consume_voice_session_provider("missing") is None


def test_prime_empty_session_id_is_noop() -> None:
    prime_voice_session_provider("", {"provider": "gemini"})
    assert consume_voice_session_provider("") is None
