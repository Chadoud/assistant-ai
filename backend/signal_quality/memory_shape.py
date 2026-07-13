"""Heuristics for email-subject-shaped memory candidates and inbox-style transcripts."""

from __future__ import annotations

import re

from signal_quality.evaluate import SignalTier, evaluate_text

_COMMITMENT_KEY = re.compile(r"^commitment\s*:", re.IGNORECASE)
_EMAIL_PREFIX = re.compile(r"^\s*(re|fwd)\s*:\s*", re.IGNORECASE)
_EMDASH_TITLE = re.compile(r"^.+\s[—–-]\s.+$")
_ALL_CAPS_TOKEN = re.compile(r"\b[A-ZÀ-Ü0-9]{4,}\b")

_TRANSCRIPT_SPEAKER = re.compile(r"^(User|Assistant)\s*:\s*", re.IGNORECASE)

PROMO_DENSITY_SKIP_THRESHOLD = 0.4
RECAP_MIN_LINES = 8
RECAP_MAX_AVG_LINE_LEN = 120
_FIRST_PERSON = re.compile(r"\b(my|i['\s]|i'm|je\s|j'|mon\s|ma\s|mes\s|moi\s)\b", re.IGNORECASE)


def looks_like_email_subject(key: str, value: str) -> bool:
    """
    True when a memory key/value pair resembles a mailing-list subject, not a user fact.

    Requires multiple signals to reduce false rejects on legitimate FR project titles.
    """
    key_trim = key.strip()
    value_trim = value.strip()
    if not key_trim or not value_trim:
        return False

    signals = 0

    if _COMMITMENT_KEY.match(key_trim):
        signals += 1

    if _EMAIL_PREFIX.match(key_trim) or _EMAIL_PREFIX.match(value_trim):
        signals += 1

    if _EMDASH_TITLE.match(value_trim) or _EMDASH_TITLE.match(key_trim):
        signals += 1

    caps = _ALL_CAPS_TOKEN.findall(value_trim)
    word_count = max(len(value_trim.split()), 1)
    if len(caps) >= 2 and len(caps) / word_count >= 0.25:
        signals += 1

    if key_trim.lower() == value_trim.lower()[: len(key_trim)].lower() and len(key_trim) > 40:
        signals += 1

    if len(key_trim) > 72 and len(value_trim) > 72:
        signals += 1

    return signals >= 2


def _strip_speaker(line: str) -> str:
    return _TRANSCRIPT_SPEAKER.sub("", line, count=1).strip()


def transcript_promo_density(transcript: str) -> float:
    """Share of transcript lines that score non-ALLOW (REJECT or QUARANTINE)."""
    lines = [ln.strip() for ln in transcript.splitlines() if ln.strip()]
    if not lines:
        return 0.0
    noisy = 0
    for line in lines:
        content = _strip_speaker(line)
        if len(content) < 4:
            continue
        if evaluate_text(content).tier != SignalTier.ALLOW:
            noisy += 1
    return noisy / len(lines)


def looks_like_inbox_recap(transcript: str) -> bool:
    """Many short lines, little first-person user voice — typical inbox listing in chat."""
    lines = [_strip_speaker(ln) for ln in transcript.splitlines() if ln.strip()]
    if len(lines) < RECAP_MIN_LINES:
        return False
    avg_len = sum(len(ln) for ln in lines) / len(lines)
    if avg_len > RECAP_MAX_AVG_LINE_LEN:
        return False
    first_person = sum(1 for ln in lines if _FIRST_PERSON.search(ln))
    return first_person < max(2, int(len(lines) * 0.15))
