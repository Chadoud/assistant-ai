"""Voice transcript hygiene before user turns are committed (TurnService)."""

from __future__ import annotations

import re

_NOISE_TAG = re.compile(r"^<\s*noise\s*>$", re.IGNORECASE)
_ALLOWED_SHORT = frozenset(
    {
        "oui",
        "yes",
        "no",
        "non",
        "ok",
        "si",
        "merci",
        "stop",
        "sure",
        "yeah",
        "yep",
        "salut",
        "bonjour",
        "bonsoir",
    }
)

# Short time/duration answers to "what time?" / "how long?" follow-ups — must not be
# dropped as junk (e.g. "midi" alone is only 4 chars but is a valid French reply).
_TIME_SHORT_ANSWERS = frozenset(
    {
        "midi",
        "matin",
        "soir",
        "minuit",
        "demain",
        "noon",
        "morning",
        "evening",
        "midnight",
        "tomorrow",
        "heure",
        "heures",
        "hour",
        "hours",
        "minute",
        "minutes",
    }
)
_TIME_TOKEN = re.compile(
    r"^\d{1,2}\s*h(?:eures?)?$|^\d{1,2}:\d{2}$",
    re.IGNORECASE,
)


def _is_meaningful_short_reply(text: str) -> bool:
    """True when a ≤2-word fragment is a deliberate answer, not STT noise."""
    if _first_word_key(text) in _ALLOWED_SHORT:
        return True
    words = text.split()
    if any(re.sub(r"[^\w]", "", w, flags=re.UNICODE).lower() in _TIME_SHORT_ANSWERS for w in words):
        return True
    if _TIME_TOKEN.match(text.strip()):
        return True
    return False


def normalize_voice_transcript_text(text: str) -> str:
    """Collapse whitespace and trim — Live STT often prefixes a space."""
    return " ".join(text.split()).strip()


def is_voice_transcript_noise_placeholder(text: str) -> bool:
    """
    True for empty lines and explicit STT noise placeholders only.

    Use while streaming partial Live STT — short fragments like ``Peux-tu`` must
    not be dropped before the rest of the sentence arrives.
    """
    stripped = normalize_voice_transcript_text(text)
    if not stripped:
        return True
    if _NOISE_TAG.match(stripped) or stripped.lower() == "[noise]":
        return True
    return False


def _first_word_key(text: str) -> str:
    word = text.strip().split()[0] if text.strip() else ""
    return re.sub(r"[^\w]", "", word, flags=re.UNICODE).lower()


def is_junk_voice_transcription(text: str) -> bool:
    """True for ``<noise>`` placeholders and meaningless micro-fragments at turn_complete."""
    stripped = normalize_voice_transcript_text(text)
    if not stripped:
        return True
    if _NOISE_TAG.match(stripped) or stripped.lower() == "[noise]":
        return True
    if not re.sub(r"[^\w]", "", stripped, flags=re.UNICODE):
        return True

    words = stripped.split()
    if len(words) <= 2 and len(stripped) <= 14:
        if _is_meaningful_short_reply(stripped):
            return False
        if stripped.endswith(",") or len(stripped) <= 8:
            return True
    return False
