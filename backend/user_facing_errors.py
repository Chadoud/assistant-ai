"""Sanitize exception text before it reaches job rows, API responses, or UI."""

from __future__ import annotations

import re

_REDACTED = "[REDACTED]"

# LiteLLM auth failures echo the bearer token — strip before any UI surface.
_RECEIVED_API_KEY_RE = re.compile(
    r"Received API Key\s*=\s*[^\s,}\"]+",
    re.IGNORECASE,
)
_KEY_HASH_RE = re.compile(
    r"Key Hash \(Token\)\s*=\s*[^\s,}\"]+",
    re.IGNORECASE,
)
_BEARER_RE = re.compile(r"Bearer\s+[A-Za-z0-9._-]+", re.IGNORECASE)
_SK_TOKEN_RE = re.compile(r"\bsk-[A-Za-z0-9_-]{4,}\b")
_AIZA_RE = re.compile(r"\bAIza[A-Za-z0-9_-]{20,}\b")


def sanitize_user_facing_error(message: str) -> str:
    """Remove API keys and bearer tokens from error strings shown to users."""
    if not message:
        return message
    out = message
    out = _RECEIVED_API_KEY_RE.sub(f"Received API Key = {_REDACTED}", out)
    out = _KEY_HASH_RE.sub(f"Key Hash (Token) = {_REDACTED}", out)
    out = _BEARER_RE.sub(f"Bearer {_REDACTED}", out)
    out = _SK_TOKEN_RE.sub("sk-…", out)
    out = _AIZA_RE.sub(_REDACTED, out)
    return out


def format_remote_llm_http_error(status_code: int, body: str) -> str:
    """
    Build a safe sort-LLM error line for ``OllamaClientError``.

    Auth failures get plain-language copy — LiteLLM bodies include partial keys.
    """
    if status_code == 401 and (
        "Invalid proxy server token" in body
        or "Authentication Error" in body
        or "invalid api key" in body.lower()
    ):
        return (
            "Sorting server rejected the connection (auth failed). "
            "Sign out and back in to refresh access. "
            "File sorting uses Exo’s cloud model on our servers — not your chat API keys."
        )
    sanitized = sanitize_user_facing_error(body)
    return f"HTTP {status_code}: {sanitized[:240]}"
