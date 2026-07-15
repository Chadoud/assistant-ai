"""Shared app-token validation for HTTP middleware and WebSocket handshakes."""

from __future__ import annotations

import hmac
import os


def expected_app_token() -> str:
    """Return configured EXOSITES_APP_TOKEN or empty when unset."""
    return os.environ.get("EXOSITES_APP_TOKEN", "").strip()


def is_insecure_local_mode() -> bool:
    """Explicit escape hatch for bare pytest / local debugging only."""
    return os.environ.get("EXOSITES_INSECURE_LOCAL", "").strip() in ("1", "true", "yes")


def require_app_token() -> bool:
    """True when missing EXOSITES_APP_TOKEN must fail closed (packaged Electron sets this)."""
    return os.environ.get("EXOSITES_REQUIRE_APP_TOKEN", "").strip() in ("1", "true", "yes")


def app_token_auth_enabled() -> bool:
    """True when requests must present a valid app token.

    Auth is **off** when ``EXOSITES_INSECURE_LOCAL=1`` (pytest / break-glass), or when
    ``EXOSITES_APP_TOKEN`` is unset **and** ``EXOSITES_REQUIRE_APP_TOKEN`` is not set.
    Packaged desktop builds must set both a token and ``EXOSITES_REQUIRE_APP_TOKEN=1``.
    """
    if is_insecure_local_mode() and not require_app_token():
        return False
    if require_app_token():
        return True
    return bool(expected_app_token())


def validate_app_token(provided: str | None) -> bool:
    """Constant-time compare of provided token against EXOSITES_APP_TOKEN.

    When ``EXOSITES_REQUIRE_APP_TOKEN=1`` and no token is configured, always reject.
    When auth is disabled (no token and not required), accept any provided value.
    """
    expected = expected_app_token()
    if require_app_token() and not expected:
        return False
    if not expected:
        return True
    if not provided:
        return False
    return hmac.compare_digest(provided.strip(), expected)
