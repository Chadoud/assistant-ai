"""Calendar create drafts: infer missing fields and build normalized pending events."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

_CREATE_OPS = frozenset({"create_calendar_event", "create_event"})
CREATE_OPS = _CREATE_OPS
_CREATE_TOOL_NAMES = frozenset({"google_workspace", "microsoft_graph", "infomaniak_services"})
CREATE_TOOL_NAMES = _CREATE_TOOL_NAMES

_TIME_TAIL_RE = re.compile(
    r"\s+(?:(?:on|for|le|la|this|next|ce|cette)\s+)?"
    r"(?:today|tomorrow|tonight|demain|aujourd'?hui|heute|morgen|oggi|domani|"
    r"monday|tuesday|wednesday|thursday|friday|saturday|sunday|"
    r"lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|"
    r"montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|"
    r"luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica)"
    r"(?:\s+(?:at|à|um|alle)\s+(?:\d{1,2}(?::\d{2})?(?:\s*(?:am|pm))?|\d{1,2}h(?:\d{2})?|midi|noon|minuit|midnight))?"
    r"\s*$",
    re.IGNORECASE,
)
_CLOCK_TAIL_RE = re.compile(
    r"\s+(?:at|à|um|alle)\s+"
    r"(?:\d{1,2}(?::\d{2})?(?:\s*(?:am|pm))?|\d{1,2}h(?:\d{2})?|midi|noon|minuit|midnight)\s*\.?$",
    re.IGNORECASE,
)
_CREATE_PREFIX_RE = re.compile(
    r"^(?:.*?\b(?:create|schedule|book|set\s+up|add|cr[eé]er?|planifier|pianificare|"
    r"erstell(?:en|e)?|anlegen)\s+(?:an?\s+|un\s+|une\s+)?(?:new\s+)?(?:calendar\s+)?"
    r"(?:event|meeting|appointment|reminder|rendez-vous|r[eé]union|[eé]v[eè]nement|termin|appuntamento)\s*)",
    re.IGNORECASE,
)
_LEADING_FILLER_RE = re.compile(
    r"^(?:pour\s+que\s+(?:j'(?:aille|aie)|je\s+(?:aille|puisse))\s+|afin\s+de\s+|"
    r"so\s+that\s+i\s+can\s+|i\s+need\s+to\s+)",
    re.IGNORECASE,
)

_WEEKDAY_OFFSETS: tuple[tuple[re.Pattern[str], int], ...] = (
    (re.compile(r"\b(?:sunday|dimanche|sonntag|domenica)\b", re.I), 6),
    (re.compile(r"\b(?:monday|lundi|montag|luned[iì])\b", re.I), 0),
    (re.compile(r"\b(?:tuesday|mardi|dienstag|marted[iì])\b", re.I), 1),
    (re.compile(r"\b(?:wednesday|mercredi|mittwoch|mercoled[iì])\b", re.I), 2),
    (re.compile(r"\b(?:thursday|jeudi|donnerstag|gioved[iì])\b", re.I), 3),
    (re.compile(r"\b(?:friday|vendredi|freitag|venerd[iì])\b", re.I), 4),
    (re.compile(r"\b(?:saturday|samedi|samstag|sabato)\b", re.I), 5),
)


def _local_timezone() -> ZoneInfo:
    """Best-effort local IANA zone for calendar writes."""
    try:
        local = datetime.now().astimezone().tzinfo
        if isinstance(local, ZoneInfo):
            return local
        key = getattr(local, "key", None)
        if isinstance(key, str) and key:
            return ZoneInfo(key)
    except Exception:
        pass
    return ZoneInfo("Europe/Paris")


def _capitalize_title(text: str) -> str:
    stripped = " ".join(text.split()).strip(" .,!?:;")
    if len(stripped) < 3:
        return ""
    return stripped[0].upper() + stripped[1:]


def extract_event_title_from_voice_text(text: str) -> str:
    """Pull a human title from natural create-event phrasing."""
    trimmed = _LEADING_FILLER_RE.sub("", text.strip()).strip()
    if not trimmed:
        return ""

    quoted = re.search(r'["""\'\']([^"""\'\']{2,80})["""\'\']', trimmed)
    if quoted:
        return _capitalize_title(quoted.group(1))

    colon = re.search(r":\s*([^:\n]{3,80})$", trimmed)
    if colon:
        title = _capitalize_title(colon.group(1))
        if title:
            return title

    subject = re.search(
        r"\b(?:called|titled|named|about|for|regarding|concerning|"
        r"pour\s+(?!que\b)|sur|riguardo|to)\s+(.{3,80})$",
        trimmed,
        re.IGNORECASE,
    )
    if subject:
        title = _capitalize_title(_TIME_TAIL_RE.sub("", subject.group(1)))
        title = _capitalize_title(_CLOCK_TAIL_RE.sub("", title))
        if title:
            return title

    with_match = re.search(r"\bwith\s+(.{2,80})$", trimmed, re.IGNORECASE)
    if with_match:
        title = _capitalize_title(_TIME_TAIL_RE.sub("", with_match.group(1)))
        title = _capitalize_title(_CLOCK_TAIL_RE.sub("", title))
        if title:
            return title

    remainder = _CREATE_PREFIX_RE.sub("", trimmed).strip()
    remainder = _TIME_TAIL_RE.sub("", remainder).strip()
    remainder = _CLOCK_TAIL_RE.sub("", remainder).strip()
    return _capitalize_title(remainder)


def _normalize_title_token(text: str) -> str:
    lowered = text.lower().strip()
    decomposed = unicodedata.normalize("NFKD", lowered)
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def _location_tail(title: str) -> str:
    match = re.search(r"\bà\s+(.+)$", title, re.IGNORECASE)
    return match.group(1).strip() if match else ""


def titles_diverge_on_location(stt_title: str, model_title: str) -> bool:
    """True when the model substituted a different place name than the user said."""
    stt_loc = _normalize_title_token(_location_tail(stt_title))
    model_loc = _normalize_title_token(_location_tail(model_title))
    if not stt_loc or not model_loc:
        return False
    if stt_loc == model_loc:
        return False
    if stt_loc in model_loc or model_loc in stt_loc:
        return False
    return True


def resolve_calendar_title(
    speech: str,
    model_title: str,
) -> tuple[str, str, bool]:
    """
    Prefer STT-derived title when the model geo-corrected a place name.

    Returns ``(title, source, overridden_from_model)``.
    """
    stt_title = extract_event_title_from_voice_text(speech)
    model = model_title.strip()
    if not stt_title:
        return model, "model", False
    if not model:
        return stt_title, "stt", False
    if titles_diverge_on_location(stt_title, model):
        return stt_title, "stt", True
    return model, "model", False


def speech_has_explicit_time(text: str) -> bool:
    """True when the user named a clock time (not just 'demain')."""
    return _extract_event_clock(text.strip()) is not None


_CALENDAR_SCHEDULING_HINT_RE = re.compile(
    r"\b(?:demain|tomorrow|aujourd'?hui|today|midi|noon|minuit|midnight|"
    r"événement|evenement|évènement|calendrier|calendar|rendez-vous|appointment|"
    r"paddle|acheter|faire\s+du)\b",
    re.IGNORECASE,
)
_CALENDAR_ACTION_HINT_RE = re.compile(
    r"\b(?:pour\s+que\s+j'(?:aille|aie)|pour\s+que\s+je|afin\s+de|"
    r"crée|créer|cree|create|schedule|book|planifier|add)\b",
    re.IGNORECASE,
)


def user_speech_implies_calendar_event(text: str) -> bool:
    """
    True when the user is asking for a calendar block, not a local reminder.

    Voice models sometimes call ``schedule_reminder`` for "demain j'achète du bourbon"
    style requests — those belong on Google Calendar when integrated.
    """
    trimmed = " ".join((text or "").split()).strip()
    if len(trimmed) < 10:
        return False
    if _CREATE_PREFIX_RE.search(trimmed):
        return True
    if re.search(
        r"\b(?:événement|evenement|évènement|calendrier|calendar|rendez-vous)\b",
        trimmed,
        re.IGNORECASE,
    ):
        return True
    if not _CALENDAR_SCHEDULING_HINT_RE.search(trimmed):
        return False
    if _CALENDAR_ACTION_HINT_RE.search(trimmed):
        return True
    title = extract_event_title_from_voice_text(trimmed)
    return bool(title and len(title) >= 5)


def _extract_event_clock(text: str) -> tuple[int, int] | None:
    colon = re.search(r"\b(\d{1,2}):(\d{2})\b", text)
    if colon:
        hour = int(colon.group(1))
        minute = int(colon.group(2))
        if 0 <= hour <= 23 and 0 <= minute <= 59:
            return hour, minute

    am_pm = re.search(r"\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b", text, re.IGNORECASE)
    if am_pm:
        hour = int(am_pm.group(1))
        minute = int(am_pm.group(2) or 0)
        meridiem = am_pm.group(3).lower()
        if meridiem == "pm" and hour < 12:
            hour += 12
        if meridiem == "am" and hour == 12:
            hour = 0
        if 0 <= hour <= 23:
            return hour, minute

    if re.search(r"(?:^|\s)(?:à|a)\s+midi\b", text, re.IGNORECASE):
        return 12, 0
    if re.search(r"(?:^|\s)(?:à|a)\s+minuit\b", text, re.IGNORECASE):
        return 0, 0
    if re.search(r"\bat\s+noon\b", text, re.IGNORECASE):
        return 12, 0
    if re.search(r"\bat\s+midnight\b", text, re.IGNORECASE):
        return 0, 0

    french = re.search(r"[aà]\s+(\d{1,2})h(\d{2})?\b", text, re.IGNORECASE)
    if french:
        hour = int(french.group(1))
        minute = int(french.group(2) or 0)
        if 0 <= hour <= 23:
            return hour, minute

    german = re.search(r"\bum\s+(\d{1,2})(?::(\d{2}))?\s*(?:uhr)?\b", text, re.IGNORECASE)
    if german:
        hour = int(german.group(1))
        minute = int(german.group(2) or 0)
        if 0 <= hour <= 23:
            return hour, minute

    italian = re.search(r"\balle\s+(\d{1,2})(?::(\d{2}))?\b", text, re.IGNORECASE)
    if italian:
        hour = int(italian.group(1))
        minute = int(italian.group(2) or 0)
        if 0 <= hour <= 23:
            return hour, minute

    return None


def _event_day(text: str, *, now: datetime) -> date:
    today = now.date()
    if re.search(r"\b(?:tomorrow|demain|morgen|domani)\b", text, re.IGNORECASE):
        return today + timedelta(days=1)
    if re.search(r"\b(?:today|tonight|aujourd'?hui|heute|oggi)\b", text, re.IGNORECASE):
        return today

    for pattern, target_weekday in _WEEKDAY_OFFSETS:
        if pattern.search(text):
            days_ahead = (target_weekday - today.weekday()) % 7
            if days_ahead == 0:
                days_ahead = 7
            return today + timedelta(days=days_ahead)

    clock = _extract_event_clock(text)
    if clock is not None:
        hour, minute = clock
        candidate = datetime(
            today.year, today.month, today.day, hour, minute, tzinfo=now.tzinfo
        )
        if candidate <= now:
            return today + timedelta(days=1)
    return today


def extract_event_start_from_voice_text(
    text: str, *, now: datetime | None = None
) -> datetime | None:
    """Return a timezone-aware start datetime inferred from speech."""
    trimmed = text.strip()
    if not trimmed:
        return None

    current = now or datetime.now(_local_timezone())
    if current.tzinfo is None:
        current = current.replace(tzinfo=_local_timezone())

    day = _event_day(trimmed, now=current)
    clock = _extract_event_clock(trimmed) or (9, 0)
    hour, minute = clock
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=current.tzinfo)


def infer_calendar_create_args(
    args: dict[str, Any],
    last_user_text: str,
    *,
    title_field: str,
) -> dict[str, Any]:
    """
    Fill summary/subject, start, and end when Gemini Live omits them on create.

    Voice models often call ``create_calendar_event`` with only ``operation`` set.
    """
    enriched = dict(args)
    operation = str(enriched.get("operation", "")).strip()
    if operation not in _CREATE_OPS:
        return enriched

    title = str(
        enriched.get(title_field)
        or enriched.get("summary")
        or enriched.get("subject")
        or enriched.get("title")
        or ""
    ).strip()
    start = str(
        enriched.get("start")
        or enriched.get("start_datetime")
        or enriched.get("start_time")
        or ""
    ).strip()
    end = str(
        enriched.get("end")
        or enriched.get("end_datetime")
        or enriched.get("end_time")
        or ""
    ).strip()

    speech = last_user_text.strip()
    title_overridden = False
    if speech and title:
        resolved, _source, overridden = resolve_calendar_title(speech, title)
        if overridden and resolved:
            title = resolved
            title_overridden = True
    if speech:
        if not title:
            title = extract_event_title_from_voice_text(speech)
        if not start:
            start_dt = extract_event_start_from_voice_text(speech)
            if start_dt is not None:
                start = start_dt.isoformat()

    if start and not end:
        try:
            start_dt = datetime.fromisoformat(start.replace("Z", "+00:00"))
            if start_dt.tzinfo is None:
                start_dt = start_dt.replace(tzinfo=_local_timezone())
            end = (start_dt + timedelta(hours=1)).isoformat()
        except ValueError:
            pass

    if title:
        enriched[title_field] = title
        if title_field == "summary":
            enriched.setdefault("subject", title)
        elif title_field == "subject":
            enriched.setdefault("summary", title)
        if title_overridden:
            enriched["_title_source"] = "stt"
    if start:
        enriched["start"] = start
        enriched.setdefault("start_datetime", start)
    if end:
        enriched["end"] = end
        enriched.setdefault("end_datetime", end)

    if title_field == "subject" and not str(enriched.get("timezone", "")).strip():
        enriched["timezone"] = str(_local_timezone().key)

    return enriched


def title_field_for_tool(tool_name: str) -> str:
    """Return the provider-specific title field name."""
    return "subject" if tool_name == "microsoft_graph" else "summary"


@dataclass
class CalendarCreateDraft:
    """Pending calendar event awaiting user confirmation."""

    tool_name: str
    args: dict[str, Any]
    source_text: str
    summary: str
    start: str
    end: str
    title_field: str
    inferred_fields: list[str] = field(default_factory=list)
    title_source: str = "stt"
    confirm_state: str = "awaiting"


def build_calendar_create_draft(
    tool_name: str,
    args: dict[str, Any],
    source_text: str,
) -> CalendarCreateDraft | None:
    """Build a normalized draft from enriched tool args and the user's speech."""
    operation = str(args.get("operation", "")).strip()
    if tool_name not in _CREATE_TOOL_NAMES or operation not in _CREATE_OPS:
        return None

    title_field = title_field_for_tool(tool_name)
    enriched = infer_calendar_create_args(args, source_text, title_field=title_field)
    model_title = str(
        args.get(title_field)
        or args.get("summary")
        or args.get("subject")
        or ""
    ).strip()
    summary, title_source, overridden = resolve_calendar_title(source_text, model_title)
    if overridden or (summary and not model_title):
        enriched[title_field] = summary
        if title_field == "summary":
            enriched.setdefault("subject", summary)
        elif title_field == "subject":
            enriched.setdefault("summary", summary)

    start = str(enriched.get("start") or enriched.get("start_datetime") or "").strip()
    end = str(enriched.get("end") or enriched.get("end_datetime") or "").strip()
    if not summary or not start or not end:
        return None

    inferred: list[str] = []
    if not speech_has_explicit_time(source_text):
        inferred.append("time_default")
    if title_source == "stt" and overridden:
        inferred.append("title_corrected")
    if not str(args.get("end") or args.get("end_datetime") or "").strip():
        inferred.append("duration_default")

    return CalendarCreateDraft(
        tool_name=tool_name,
        args=enriched,
        source_text=source_text.strip(),
        summary=summary,
        start=start,
        end=end,
        title_field=title_field,
        inferred_fields=inferred,
        title_source=title_source,
    )


def draft_missing_field(draft: CalendarCreateDraft) -> str | None:
    """Return a missing required field key, or None when the draft is complete."""
    if not draft.summary.strip():
        return "title"
    if not draft.start.strip():
        return "time"
    if not speech_has_explicit_time(draft.source_text):
        return "time"
    return None


def needs_confirmation(draft: CalendarCreateDraft) -> bool:
    """All integrated calendar creates require an explicit user confirmation."""
    return draft_missing_field(draft) is None


def is_calendar_create_call(name: str, args: dict[str, Any]) -> bool:
    """True when this tool call would create a calendar event."""
    operation = str(args.get("operation", "")).strip()
    return name in _CREATE_TOOL_NAMES and operation in _CREATE_OPS
