"""Merge short voice follow-ups with prior calendar-create utterances."""

from __future__ import annotations

import re

from services.calendar.draft import _extract_event_clock, extract_event_title_from_voice_text
from voice.history import VoiceTurn

_CREATE_HINT_RE = re.compile(
    r"\b(?:create|schedule|book|cr[eé]er?|planifier|événement|event|meeting|"
    r"appointment|rendez-vous|réunion|paddle|acheter|aller)\b",
    re.IGNORECASE,
)

_TIME_ONLY_RE = re.compile(
    r"^(?:à\s+)?(?:midi|minuit|noon|midnight|matin|soir|demain|"
    r"\d{1,2}\s*h(?:eures?)?|\d{1,2}:\d{2}|"
    r"(?:une|1)\s+heure(?:s)?|(?:half an hour|30 minutes?))\s*\.?$",
    re.IGNORECASE,
)

_DURATION_SUFFIX_RE = re.compile(
    r"\b(?:pour|for)\s+(?:une|1)\s+heure(?:s)?\b",
    re.IGNORECASE,
)


def is_time_only_voice_reply(text: str) -> bool:
    """True when the utterance is only a time or duration answer."""
    stripped = " ".join(text.split()).strip()
    if not stripped or len(stripped) > 48:
        return False
    if _TIME_ONLY_RE.match(stripped):
        return True
    if _extract_event_clock(stripped) is not None and len(stripped.split()) <= 4:
        return True
    if _DURATION_SUFFIX_RE.search(stripped) and _extract_event_clock(stripped) is not None:
        return True
    return False


def _prior_create_user_turn(history: list[VoiceTurn]) -> str:
    for turn in reversed(history):
        user = str(turn.get("user", "") or "").strip()
        if not user:
            continue
        if _CREATE_HINT_RE.search(user) or extract_event_title_from_voice_text(user):
            return user
    return ""


def resolve_speech_for_mutating_tool(
    history: list[VoiceTurn],
    current_user_text: str,
) -> str:
    """
    Combine a short time follow-up with the last calendar-create request.

    Example: prior "paddle avec Alexandre demain" + current "midi" → full context
    for ``infer_calendar_create_args``.
    """
    current = " ".join(current_user_text.split()).strip()
    if not current:
        return _prior_create_user_turn(history)
    if not is_time_only_voice_reply(current):
        return current

    prior = _prior_create_user_turn(history)
    if not prior:
        return current
    if current.lower() in prior.lower():
        return prior
    time_fragment = current
    if re.match(r"^(midi|minuit|noon|midnight)$", current, re.IGNORECASE):
        time_fragment = f"à {current}"
    return f"{prior} {time_fragment}".strip()
