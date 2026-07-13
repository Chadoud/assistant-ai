"""Tests for user-facing error sanitization."""

from __future__ import annotations

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from user_facing_errors import format_remote_llm_http_error, sanitize_user_facing_error


def test_sanitize_strips_litellm_received_api_key() -> None:
    raw = (
        'Authentication Error, Invalid proxy server token passed. '
        'Received API Key = sk-ant-api03-abc123xyz79bd, Key Hash (Token) =0fe77def'
    )
    out = sanitize_user_facing_error(raw)
    assert "sk-ant" not in out
    assert "79bd" not in out
    assert "[REDACTED]" in out


def test_sanitize_strips_bearer_and_sk_tokens() -> None:
    raw = "failed with Bearer sk-live-secret-key and AIzaSyABCDEF01234567890123456789012"
    out = sanitize_user_facing_error(raw)
    assert "sk-live" not in out
    assert "AIzaSyABCDEF" not in out


def test_format_remote_llm_auth_error_is_plain_language() -> None:
    body = '{"error":{"message":"Authentication Error, Invalid proxy server token passed. Received API Key = sk-...79bd"}}'
    out = format_remote_llm_http_error(401, body)
    assert "sk-" not in out
    assert "79bd" not in out
    assert "chat API keys" in out


def test_format_remote_llm_other_status_sanitizes_body() -> None:
    body = "upstream failed token sk-secret1234567890"
    out = format_remote_llm_http_error(503, body)
    assert "sk-secret" not in out
    assert "HTTP 503" in out
