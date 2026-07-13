"""Shared guard against the assistant typing credentials during autonomous control.

Both the web-navigator (DOM-aware) and computer-use (screenshot-only) agents must
refuse to type into password / 2FA / captcha contexts and hand control back to the
user instead. Centralizing the hint lists and detection here keeps the two agents
from drifting apart, so a guard tightened for one applies to both.
"""

from __future__ import annotations

import re
from typing import Any

# HTML input ``type`` values that always hold a secret.
SECRET_INPUT_TYPES = frozenset({"password"})

# Substrings (English + common FR/DE) that mark a credential / verification context.
SECRET_HINTS: tuple[str, ...] = (
    "password",
    "passcode",
    "otp",
    "one-time",
    "one time",
    "verification code",
    "2fa",
    "two-factor",
    "two factor",
    "authenticator",
    "security code",
    "mot de passe",
    "code de vérification",
    "captcha",
)

_SECRET_RE = re.compile("|".join(re.escape(hint) for hint in SECRET_HINTS), re.IGNORECASE)

DEFAULT_SECRET_HANDOFF_REASON = (
    "A password, verification code, or captcha was detected. Please complete this step yourself."
)


def looks_like_secret_context(*texts: str | None) -> bool:
    """True if any provided text references a password / 2FA / captcha context."""
    return any(text and _SECRET_RE.search(text) for text in texts)


def is_secret_field(name: str | None, field_type: str | None = None) -> bool:
    """True if a field's input type or accessible name marks it as a secret."""
    if (field_type or "").lower() in SECRET_INPUT_TYPES:
        return True
    return looks_like_secret_context(name)


def enforce_credential_guard(
    action: dict[str, Any],
    *,
    handoff_type: str = "needs_user",
    handoff_reason: str | None = None,
) -> dict[str, Any]:
    """Refuse to type on a credential / 2FA / captcha screen — hand off to the user."""
    if action.get("type") != "type":
        return action
    is_sensitive = bool(action.get("sensitive")) or looks_like_secret_context(
        str(action.get("text") or ""), str(action.get("reason") or "")
    )
    if is_sensitive:
        return {
            "type": handoff_type,
            "reason": handoff_reason or DEFAULT_SECRET_HANDOFF_REASON,
        }
    return action
