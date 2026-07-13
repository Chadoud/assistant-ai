"""Contract: user-visible job errors must not contain API key material."""

from __future__ import annotations

import re

from user_facing_errors import sanitize_user_facing_error

_SECRET_PATTERN = re.compile(
    r"sk-[A-Za-z0-9_-]{6,}|Bearer\s+[A-Za-z0-9._-]{10,}|AIza[A-Za-z0-9_-]{20,}",
    re.IGNORECASE,
)


def test_sanitize_strips_litellm_auth_body() -> None:
    raw = (
        "HTTP 401: Authentication Error, Invalid proxy server token. "
        "Received API Key = sk-ant-api03-secretkey79bd, Key Hash (Token) =0fe77def"
    )
    out = sanitize_user_facing_error(raw)
    assert _SECRET_PATTERN.search(out) is None


def test_sanitize_strips_bearer_and_sk_tokens() -> None:
    raw = "failed Bearer sk-live-secret-key-12345"
    out = sanitize_user_facing_error(raw)
    assert "sk-live" not in out
    assert "Bearer sk" not in out
