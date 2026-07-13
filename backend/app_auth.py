"""Shared app-token validation for HTTP middleware and WebSocket handshakes."""

from __future__ import annotations

import hmac
import os


def expected_app_token() -> str:
    """Return configured EXOSITES_APP_TOKEN or empty when auth is disabled."""
    return os.environ.get("EXOSITES_APP_TOKEN", "").strip()


def is_insecure_local_mode() -> bool:
    """Explicit escape hatch for bare pytest / local debugging only."""
    return os.environ.get("EXOSITES_INSECURE_LOCAL", "").strip() in ("1", "true", "yes")


def app_token_auth_enabled() -> bool:
    """True when requests must present a valid app token."""
    if is_insecure_local_mode():
        return False
    return bool(expected_app_token())


def validate_app_token(provided: str | None) -> bool:
    """Constant-time compare of provided token against EXOSITES_APP_TOKEN."""
    expected = expected_app_token()
    if not expected:
        return True
    if not provided:
        return False
    return hmac.compare_digest(provided.strip(), expected)
