"""Calendar create confirm/reject/patch parsing and recap formatting."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Literal
from zoneinfo import ZoneInfo

from .draft import (
    CalendarCreateDraft,
    _extract_event_clock,
    build_calendar_create_draft,
    draft_missing_field,
    extract_event_start_from_voice_text,
    speech_has_explicit_time,
    user_speech_implies_calendar_event,
)

_CONFIRM_RE = re.compile(
    r"^(?:oui|ouais|yes|yeah|yep|ok(?:ay)?|d'accord|dac|c'est bon|c est bon|"
    r"parfait|correct|go ahead|do it|vas[- ]?y|allez[- ]?y)\b",
    re.IGNORECASE,
)
_REJECT_RE = re.compile(
    r"^(?:non|no|annule|annuler|cancel|stop|laisse tomber|laisse[- ]?tomber)\b",
    re.IGNORECASE,
)
_TITLE_PATCH_RE = re.compile(
    r"(?:c'est|cest|non,? c'est|plut[oô]t)\s+(.{3,80})$",
    re.IGNORECASE,
)
_LOCATION_PATCH_RE = re.compile(
    r"(?:à|a)\s+([A-Za-zÀ-ÿ0-9][\wÀ-ÿ' -]{2,60})\s*\.?$",
    re.IGNORECASE,
)


class CalendarConfirmActionKind(str, Enum):
    """Outcome of parsing a user reply to a calendar recap."""

    NONE = "none"
    CONFIRM = "confirm"
    REJECT = "reject"
    PATCH = "patch"


@dataclass
class CalendarConfirmAction:
    """Parsed user response to a pending calendar draft."""

    kind: CalendarConfirmActionKind
    patch: dict[str, str] = field(default_factory=dict)


def _local_timezone() -> ZoneInfo:
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


def _parse_iso(iso: str) -> datetime | None:
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=_local_timezone())
        return dt
    except ValueError:
        return None


def _format_clock(dt: datetime) -> str:
    return dt.strftime("%H:%M")


def _format_day(dt: datetime, *, now: datetime) -> str:
    day = dt.date()
    today = now.date()
    if day == today:
        return "aujourd'hui"
    if day == today + timedelta(days=1):
        return "demain"
    return dt.strftime("%A %d %B")


def format_calendar_recap(draft: CalendarCreateDraft, *, now: datetime | None = None) -> str:
    """Plain-language recap for voice or chat confirmation."""
    current = now or datetime.now(_local_timezone())
    start_dt = _parse_iso(draft.start)
    end_dt = _parse_iso(draft.end)
    if start_dt is None or end_dt is None:
        return f"{draft.summary} — je crée l'événement ?"

    duration_min = max(15, int((end_dt - start_dt).total_seconds() // 60))
    if duration_min % 60 == 0:
        duration_label = "1 heure" if duration_min == 60 else f"{duration_min // 60} heures"
    else:
        duration_label = f"{duration_min} minutes"

    day_label = _format_day(start_dt, now=current)
    clock = _format_clock(start_dt)
    return (
        f"{day_label} à {clock}, {duration_label} — {draft.summary}. "
        "Je crée l'événement ?"
    )


def format_missing_field_prompt(field: str) -> str:
    """Ask the user for one missing calendar field."""
    if field == "time":
        return "À quelle heure ?"
    if field == "title":
        return "Quel titre pour l'événement ?"
    return "Il me manque un détail — pouvez-vous préciser ?"


def needs_confirmation_tool_result(draft: CalendarCreateDraft) -> dict[str, Any]:
    """Synthetic tool result instructing the model to recap without creating."""
    recap = format_calendar_recap(draft)
    return {
        "ok": True,
        "data": {
            "status": "needs_confirmation",
            "recap": recap,
            "summary": draft.summary,
            "start": draft.start,
            "end": draft.end,
            "draft": {
                "summary": draft.summary,
                "start": draft.start,
                "end": draft.end,
                "tool_name": draft.tool_name,
            },
        },
        "summary": (
            f"CONFIRMATION REQUIRED. Say this recap aloud ONCE in one sentence: {recap} "
            "Then STOP and wait for the user to confirm. Do NOT repeat the recap unless "
            "the user corrects something. Do NOT say the event was created yet."
        ),
    }


def needs_input_tool_result(field: str) -> dict[str, Any]:
    """Synthetic tool result when a required field is still missing."""
    prompt = format_missing_field_prompt(field)
    return {
        "ok": True,
        "data": {
            "status": "needs_input",
            "missing": field,
            "prompt": prompt,
        },
        "summary": (
            f"Ask the user in one short sentence: {prompt} "
            "Do NOT call create_calendar_event again until they answer."
        ),
    }


def _normalize_reply_text(text: str) -> str:
    return " ".join((text or "").lower().split())


def _is_repeat_of_draft_source(user_text: str, draft: CalendarCreateDraft) -> bool:
    """
    True when the user re-states the original request at turn_complete.

    Voice often commits the full utterance after the tool already built a draft
    from the same speech — that must not be treated as a correction.
    """
    source = _normalize_reply_text(draft.source_text)
    reply = _normalize_reply_text(user_text)
    if not source or not reply:
        return False
    if reply == source:
        return True
    if len(reply) >= 30 and (reply in source or source in reply):
        return True
    return False


def _location_token_looks_like_time(token: str) -> bool:
    cleaned = token.strip()
    if _extract_event_clock(cleaned) is not None:
        return True
    if re.match(r"^\d{1,2}h\d{0,2}$", cleaned, re.IGNORECASE):
        return True
    if re.match(r"^\d{1,2}:\d{2}$", cleaned):
        return True
    return False


def _start_times_match(iso_a: str, iso_b: str, *, tolerance_seconds: int = 60) -> bool:
    start_a = _parse_iso(iso_a)
    start_b = _parse_iso(iso_b)
    if start_a is None or start_b is None:
        return False
    return abs((start_a - start_b).total_seconds()) <= tolerance_seconds


def parse_simple_confirm_reply(user_text: str) -> Literal["none", "confirm", "reject"]:
    """Classify short yes/no replies for text chat (subset of full draft parser)."""
    text = " ".join((user_text or "").split()).strip()
    if not text:
        return "none"
    if _REJECT_RE.search(text):
        return "reject"
    if _CONFIRM_RE.search(text):
        return "confirm"
    return "none"


def parse_calendar_confirm_response(
    user_text: str,
    draft: CalendarCreateDraft,
) -> CalendarConfirmAction:
    """Classify the user's reply to a pending calendar recap."""
    text = " ".join((user_text or "").split()).strip()
    if not text:
        return CalendarConfirmAction(CalendarConfirmActionKind.NONE)

    if _REJECT_RE.search(text):
        return CalendarConfirmAction(CalendarConfirmActionKind.REJECT)

    if _CONFIRM_RE.search(text):
        return CalendarConfirmAction(CalendarConfirmActionKind.CONFIRM)

    if _is_repeat_of_draft_source(text, draft):
        return CalendarConfirmAction(CalendarConfirmActionKind.NONE)

    if user_speech_implies_calendar_event(text) and len(text) > 40:
        return CalendarConfirmAction(CalendarConfirmActionKind.NONE)

    patch: dict[str, str] = {}
    title_match = _TITLE_PATCH_RE.search(text)
    if title_match:
        patch["summary"] = title_match.group(1).strip(" .,!?:;")

    if speech_has_explicit_time(text) and not (
        speech_has_explicit_time(draft.source_text) and len(text) > 40
    ):
        start_dt = extract_event_start_from_voice_text(text)
        if start_dt is not None and not _start_times_match(
            start_dt.isoformat(), draft.start
        ):
            patch["start"] = start_dt.isoformat()
            end_dt = start_dt + timedelta(hours=1)
            patch["end"] = end_dt.isoformat()

    if not patch.get("summary"):
        loc_match = _LOCATION_PATCH_RE.search(text)
        if loc_match:
            location = loc_match.group(1).strip()
            if not _location_token_looks_like_time(location):
                base = draft.summary
                if re.search(r"\bà\s+", base, re.IGNORECASE):
                    base = re.sub(
                        r"\bà\s+.+$", f"à {location}", base, flags=re.IGNORECASE
                    )
                else:
                    base = f"{base} à {location}"
                patch["summary"] = base.strip()

    if patch:
        return CalendarConfirmAction(CalendarConfirmActionKind.PATCH, patch)

    if speech_has_explicit_time(text) and draft_missing_field(draft) == "time":
        start_dt = extract_event_start_from_voice_text(
            f"{draft.source_text} {text}"
        )
        if start_dt is not None:
            return CalendarConfirmAction(
                CalendarConfirmActionKind.PATCH,
                {
                    "start": start_dt.isoformat(),
                    "end": (start_dt + timedelta(hours=1)).isoformat(),
                },
            )

    return CalendarConfirmAction(CalendarConfirmActionKind.NONE)


def apply_calendar_draft_patch(
    draft: CalendarCreateDraft,
    patch: dict[str, str],
) -> CalendarCreateDraft:
    """Return an updated draft after the user corrected details."""
    args = dict(draft.args)
    if patch.get("summary"):
        args[draft.title_field] = patch["summary"]
        if draft.title_field == "summary":
            args["subject"] = patch["summary"]
        else:
            args["summary"] = patch["summary"]
    if patch.get("start"):
        args["start"] = patch["start"]
        args["start_datetime"] = patch["start"]
    if patch.get("end"):
        args["end"] = patch["end"]
        args["end_datetime"] = patch["end"]

    merged_source = draft.source_text
    if patch.get("start") and not speech_has_explicit_time(draft.source_text):
        merged_source = f"{draft.source_text} {patch['start']}"

    rebuilt = build_calendar_create_draft(draft.tool_name, args, merged_source)
    if rebuilt is None:
        return draft
    rebuilt.confirm_state = "corrected"
    rebuilt.title_source = "patched" if patch.get("summary") else rebuilt.title_source
    return rebuilt


def confirmed_calendar_args(draft: CalendarCreateDraft) -> dict[str, Any]:
    """Tool args ready for API dispatch after user confirmation."""
    return {**draft.args, "_confirmed": True}


def execute_confirmed_calendar_draft(draft: CalendarCreateDraft) -> dict[str, Any]:
    """Run the calendar API after the user confirmed the recap."""
    from tool_registry import dispatch_sync

    try:
        return dispatch_sync(
            draft.tool_name,
            confirmed_calendar_args(draft),
            approval_granted=True,
        )
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}


def tool_result_blocks_promise_nudge(result: Any) -> bool:
    """True when a tool outcome is waiting on the user, not a failure."""
    if not isinstance(result, dict):
        return False
    data = result.get("data")
    if not isinstance(data, dict):
        return False
    return data.get("status") in ("needs_confirmation", "needs_input")


def format_calendar_create_completion(
    tool_name: str,
    draft: CalendarCreateDraft,
    result: Any,
) -> str:
    """Follow-up text injected after a confirmed calendar create."""
    if isinstance(result, dict) and result.get("ok"):
        recap = format_calendar_recap(draft).replace(" Je crée l'événement ?", "")
        return (
            f"[TOOL_RESULT {tool_name}] DONE: {recap} "
            "Tell the user now in one short sentence that it is on their calendar."
        )
    err = "it didn't work"
    if isinstance(result, dict):
        err = str(result.get("error") or err).strip()
    return (
        f"[TOOL_RESULT {tool_name}] FAILED: {err} "
        "Tell the user in one short sentence that it did not work and why."
    )
