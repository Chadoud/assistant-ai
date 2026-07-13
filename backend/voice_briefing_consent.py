"""Startup-briefing consent: phrase detection + persistence.

The voice model is *instructed* to call ``save_memory`` when the user enables or
disables the startup briefing, but it does so unreliably — it often only speaks
the acknowledgement ("I won't run it anymore") without persisting anything, so the
briefing keeps auto-running next session.

This module lets the server enforce the user's spoken/typed intent directly:
detect the phrase, then write ``preferences.startup_briefing_consent`` itself. It
is dependency-light (only ``assistant_memory``) so both the WebSocket route and the
voice session loop can use it without import cycles.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

STARTUP_BRIEFING_CONSENT_KEY = "startup_briefing_consent"

# Phrases that mean "stop auto-running the briefing". Matched case-insensitively as
# substrings against the user's utterance, in the languages the assistant supports.
_DECLINE_PHRASES = (
    "stop the briefing",
    "stop briefing",
    "no briefing",
    "don't run the briefing",
    "dont run the briefing",
    "don't run my briefing",
    "do not run the briefing",
    "no more briefing",
    "stop running the briefing",
    "disable the briefing",
    "disable briefing",
    "turn off the briefing",
    "no startup briefing",
    "don't brief me",
    # French
    "arrête le briefing",
    "arrete le briefing",
    "plus de briefing",
    "pas de briefing",
    "ne fais plus le briefing",
    "désactive le briefing",
    "desactive le briefing",
    # German
    "kein briefing",
    "briefing stoppen",
    "kein briefing mehr",
    "deaktiviere das briefing",
    # Italian
    "niente briefing",
    "ferma il briefing",
    "disattiva il briefing",
)

# Phrases that mean "resume auto-running the briefing".
_ENABLE_PHRASES = (
    "run the briefing on startup",
    "enable the briefing",
    "turn on the briefing",
    "always run the briefing",
    "run my briefing automatically",
    "active le briefing",
    "active mon briefing",
    "briefing aktivieren",
    "attiva il briefing",
)


def _normalize(text: str) -> str:
    return (text or "").strip().lower()


def looks_like_briefing_decline(text: str) -> bool:
    """True when the user asked to stop the auto-running startup briefing."""
    low = _normalize(text)
    if not low:
        return False
    return any(phrase in low for phrase in _DECLINE_PHRASES)


def looks_like_briefing_enable(text: str) -> bool:
    """True when the user asked to (re-)enable the auto-running startup briefing."""
    low = _normalize(text)
    if not low:
        return False
    return any(phrase in low for phrase in _ENABLE_PHRASES)


def persist_briefing_consent(value: str) -> bool:
    """Write ``startup_briefing_consent`` (``granted``/``declined``). Never raises.

    :returns: True on success, False if persistence failed.
    """
    if value not in ("granted", "declined", "ask"):
        raise ValueError(f"invalid briefing consent value: {value!r}")
    try:
        from assistant_memory import update_memory

        update_memory("preferences", STARTUP_BRIEFING_CONSENT_KEY, value)
        return True
    except Exception:  # noqa: BLE001 — consent persistence must never break the session
        logger.debug("failed to persist briefing consent=%s", value, exc_info=True)
        return False
