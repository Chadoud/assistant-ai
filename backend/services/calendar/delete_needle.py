"""Calendar delete title needle extraction and event matching."""

from __future__ import annotations

import re
from typing import Any

_DELETE_NEEDLE_RE = re.compile(
    r"\b(?:all|every|each)\s+(?:my\s+)?([A-Za-zÀ-ÿ0-9][\wÀ-ÿ-]{1,32})\s+"
    r"(?:events?|meetings?|appointments?|calendar)\b",
    re.IGNORECASE,
)
_DELETE_TITLE_RE = re.compile(
    r"\b(?:delete|remove|cancel)\s+(?:the\s+)?(.+?)\s+(?:event|meeting|appointment)\b",
    re.IGNORECASE,
)
_DELETE_EVENTS_TITLE_RE = re.compile(
    r"\b(?:delete|remove|cancel|supprim\w*|effac\w*)\s+"
    r"(?:all\s+)?(?:the\s+)?(?:my\s+)?(.+?)\s+events?\b",
    re.IGNORECASE,
)
_DELETE_CALENDAR_EVENTS_RE = re.compile(
    r"\b(?:the\s+)?(?:my\s+)?(.+?)\s+events?\s+(?:on\s+)?(?:my\s+)?"
    r"(?:calendar|calendrier|agenda)\b",
    re.IGNORECASE,
)
_DELETE_ENTIRE_CALENDAR_RE = re.compile(
    r"\b(?:"
    r"all\s+(?:my\s+)?(?:calendar\s+)?events?|"
    r"everything\s+on\s+(?:my\s+)?calendar|"
    r"delete\s+everything\s+on\s+(?:my\s+)?calendar|"
    r"clear\s+(?:my\s+)?(?:whole\s+)?calendar|"
    r"tous\s+les\s+(?:événements|events)(?:\s+sur\s+mon\s+calendrier)?"
    r")\b",
    re.IGNORECASE,
)
_NEEDLE_STOP_WORDS = frozenset(
    {"all", "every", "my", "the", "on", "from", "calendar", "events", "event", "a", "an"}
)


_ARTICLE_PREFIX_RE = re.compile(
    r"^(?:de|du|des|le|la|les|the|my)\s+",
    re.IGNORECASE,
)


def _clean_delete_needle(raw: str) -> str | None:
    title = raw.strip()
    title = _ARTICLE_PREFIX_RE.sub("", title).strip()
    for stop in _NEEDLE_STOP_WORDS:
        title = re.sub(rf"\b{re.escape(stop)}\b", "", title, flags=re.I).strip()
    return title or None


def _normalize_needle_tokens(needle: str) -> list[str]:
    """Tokenize a delete needle for fuzzy title matching."""
    cleaned = _ARTICLE_PREFIX_RE.sub("", needle.strip().lower()).strip()
    tokens: list[str] = []
    for word in re.split(r"\W+", cleaned):
        if not word or word in _NEEDLE_STOP_WORDS:
            continue
        if word == "works":
            word = "work"
        elif word.endswith("s") and len(word) > 3:
            singular = word[:-1]
            if singular:
                word = singular
        tokens.append(word)
    return tokens


def extract_calendar_delete_needle(text: str) -> str | None:
    """Extract a title filter from a bulk calendar delete utterance."""
    match = _DELETE_NEEDLE_RE.search(text)
    if match:
        return _clean_delete_needle(match.group(1)) or match.group(1).strip()
    match = _DELETE_EVENTS_TITLE_RE.search(text)
    if match:
        cleaned = _clean_delete_needle(match.group(1))
        if cleaned:
            return cleaned
    match = _DELETE_CALENDAR_EVENTS_RE.search(text)
    if match:
        cleaned = _clean_delete_needle(match.group(1))
        if cleaned:
            return cleaned
    match = _DELETE_TITLE_RE.search(text)
    if match:
        cleaned = _clean_delete_needle(match.group(1))
        if cleaned:
            return cleaned
    quoted = re.search(r'["\']([^"\']{2,48})["\']', text)
    if quoted:
        return quoted.group(1).strip()
    return None


def is_delete_entire_calendar_intent(text: str) -> bool:
    """True when the user wants every event on the calendar removed."""
    return bool(_DELETE_ENTIRE_CALENDAR_RE.search(text or ""))


def match_calendar_events_for_delete(
    events: list[dict[str, Any]],
    needle: str | None,
) -> list[str]:
    """Return event IDs whose summary matches the delete needle."""
    if not events or not needle:
        return []
    tokens = _normalize_needle_tokens(needle)
    if not tokens:
        return []
    matched: list[str] = []
    for event in events:
        event_id = str(event.get("id") or "").strip()
        if not event_id:
            continue
        summary = str(event.get("summary") or "").strip().lower()
        if not summary:
            continue
        if all(token in summary for token in tokens):
            matched.append(event_id)
            continue
        if len(tokens) == 1 and tokens[0] in summary:
            matched.append(event_id)
    return matched
