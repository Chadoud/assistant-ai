"""Calendar delete recap, scope parsing, and tool-result helpers."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import Enum
from typing import Any
from zoneinfo import ZoneInfo

from .confirm import parse_simple_confirm_reply
from .delete_batch import (
    batch_series_count,
    format_batch_delete_recap,
    is_bulk_delete_all_matched_intent,
)
from .delete_draft import CalendarDeleteDraft
from .schemas import RecurrenceScope

_THIS_INSTANCE_RE = re.compile(
    r"\b(just\s+this(\s+one)?|only\s+this(\s+(event|occurrence|one))?|this\s+event\s+only|"
    r"seulement\s+cette\s+fois|juste\s+celui[- ]?ci|cette\s+occurrence\s+seulement|"
    r"nur\s+(diesen|dieses|diese)|solo\s+questo|solo\s+questa|solo\s+questo\s+evento)\b",
    re.IGNORECASE,
)
_THIS_AND_FOLLOWING_RE = re.compile(
    r"\b(this\s+and\s+(all\s+)?following|all\s+the\s+following|all\s+following|"
    r"following\s+recurr(?:ence|encies|encies)?|"
    r"all\s+future(\s+ones)?|following\s+events|"
    r"from\s+now\s+on|celui[- ]?ci\s+et\s+(les\s+)?suivants?|tous\s+les\s+prochains|"
    r"à\s+partir\s+(de\s+)?(maintenant|là)|"
    r"(diesen\s+und\s+)?(alle\s+)?folgenden|alle\s+zukünftigen|"
    r"questo\s+e\s+(i\s+)?successivi|tutti\s+i\s+prossimi)\b",
    re.IGNORECASE,
)
_ALL_SERIES_RE = re.compile(
    r"\b(all\s+events|entire\s+series|whole\s+series|delete\s+the\s+series|"
    r"toute\s+la\s+s[ée]rie|tous\s+les\s+[ée]v[ée]nements|s[ée]rie\s+enti[èe]re|"
    r"gesamte\s+serie|alle\s+termine|intera\s+serie|tutti\s+gli\s+eventi)\b",
    re.IGNORECASE,
)


class CalendarDeleteActionKind(str, Enum):
    """Outcome of parsing a user reply to a delete recap."""

    NONE = "none"
    REJECT = "reject"
    CONFIRM = "confirm"
    SCOPE = "scope"


@dataclass
class CalendarDeleteAction:
    """Parsed user response to a pending delete recap."""

    kind: CalendarDeleteActionKind
    scope: RecurrenceScope | None = None


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


def _format_day(dt: datetime, *, now: datetime) -> str:
    day = dt.date()
    today = now.date()
    if day == today:
        return "today"
    if day == today + timedelta(days=1):
        return "tomorrow"
    return dt.strftime("%A %d %B")


def format_delete_recap(draft: CalendarDeleteDraft, *, now: datetime | None = None) -> str:
    """Plain-language delete recap for voice or chat."""
    if batch_series_count(draft) > 1:
        return format_batch_delete_recap(draft)

    current = now or datetime.now(_local_timezone())
    start_dt = _parse_iso(draft.start)
    time_part = ""
    if start_dt is not None:
        time_part = f"{_format_day(start_dt, now=current)} at {start_dt.strftime('%H:%M')}"

    if draft.is_recurring and draft.recurring_event_id:
        recur = draft.recurrence_label or "on a schedule"
        base = f"{draft.summary}"
        if time_part:
            base += f", {time_part}"
        return (
            f"{base} — repeats {recur}. "
            "Delete only this occurrence, this and future ones, or the entire series?"
        )

    if time_part:
        return f"Delete {draft.summary}, {time_part}?"
    return f"Delete {draft.summary}?"


def parse_delete_scope(text: str) -> RecurrenceScope | None:
    """Extract recurrence scope from a user reply."""
    if _ALL_SERIES_RE.search(text):
        return "all_series"
    if _THIS_AND_FOLLOWING_RE.search(text):
        return "this_and_following"
    if _THIS_INSTANCE_RE.search(text):
        return "this_instance"
    return None


def is_delete_followup_reply(text: str) -> bool:
    """True when user speech is only scope/confirm vocabulary, not a new delete request."""
    stripped = " ".join((text or "").split()).strip()
    if not stripped:
        return False
    if parse_delete_scope(stripped):
        return True
    if parse_simple_confirm_reply(stripped) in ("confirm", "reject"):
        return True
    return is_bulk_delete_all_matched_intent(stripped)


def parse_delete_confirm_response(
    user_text: str,
    draft: CalendarDeleteDraft,
) -> CalendarDeleteAction:
    """Classify the user's reply to a pending delete recap."""
    text = " ".join((user_text or "").split()).strip()
    if not text:
        return CalendarDeleteAction(CalendarDeleteActionKind.NONE)

    simple = parse_simple_confirm_reply(text)
    if simple == "reject":
        return CalendarDeleteAction(CalendarDeleteActionKind.REJECT)

    scope = parse_delete_scope(text)
    if scope is not None:
        return CalendarDeleteAction(CalendarDeleteActionKind.SCOPE, scope)

    if is_bulk_delete_all_matched_intent(text):
        if (
            draft.is_recurring
            or draft.recurring_event_id
            or draft.recurrence_label
            or draft.additional_series
            or batch_series_count(draft) > 1
        ):
            return CalendarDeleteAction(CalendarDeleteActionKind.SCOPE, "all_series")
        return CalendarDeleteAction(CalendarDeleteActionKind.CONFIRM)

    if simple == "confirm":
        if draft.is_recurring and (draft.additional_series or batch_series_count(draft) > 1):
            return CalendarDeleteAction(CalendarDeleteActionKind.SCOPE, "all_series")
        if draft.is_recurring:
            return CalendarDeleteAction(CalendarDeleteActionKind.NONE)
        return CalendarDeleteAction(CalendarDeleteActionKind.CONFIRM)

    return CalendarDeleteAction(CalendarDeleteActionKind.NONE)


def needs_delete_scope_tool_result(draft: CalendarDeleteDraft) -> dict[str, Any]:
    """Synthetic tool result: ask user for delete scope before mutating."""
    recap = format_delete_recap(draft)
    return {
        "ok": True,
        "data": {
            "status": "needs_scope",
            "recap": recap,
            "draft": draft_to_payload(draft),
            "scope_options": ["this_instance", "this_and_following", "all_series"],
        },
        "summary": (
            f"CONFIRMATION REQUIRED. Say this recap aloud ONCE: {recap} "
            "Then STOP and wait for the user to choose a scope. "
            "Do NOT delete until they answer."
        ),
    }


def needs_delete_confirm_tool_result(draft: CalendarDeleteDraft) -> dict[str, Any]:
    """Synthetic tool result for non-recurring delete confirm."""
    recap = format_delete_recap(draft)
    return {
        "ok": True,
        "data": {
            "status": "needs_confirmation",
            "recap": recap,
            "draft": draft_to_payload(draft),
        },
        "summary": (
            f"CONFIRMATION REQUIRED. Say this recap aloud ONCE: {recap} "
            "Wait for yes/no before deleting."
        ),
    }


def draft_to_payload(draft: CalendarDeleteDraft) -> dict[str, Any]:
    """Serialize draft for tool results and REST."""
    payload = {
        "tool_name": draft.tool_name,
        "calendar_id": draft.calendar_id,
        "event_id": draft.event_id,
        "recurring_event_id": draft.recurring_event_id,
        "summary": draft.summary,
        "start": draft.start,
        "end": draft.end,
        "is_recurring": draft.is_recurring,
        "recurrence_label": draft.recurrence_label,
        "source_text": draft.source_text,
        "standalone_event_ids": draft.standalone_event_ids,
        "awaitingConfirm": True,
    }
    if draft.additional_series:
        payload["additional_series"] = [
            {
                "event_id": target.event_id,
                "recurring_event_id": target.recurring_event_id,
                "summary": target.summary,
                "start": target.start,
                "end": target.end,
            }
            for target in draft.additional_series
        ]
    return payload


def _additional_series_from_payload(payload: dict[str, Any]) -> list:
    from .delete_draft import SeriesDeleteTarget

    raw = payload.get("additional_series") or payload.get("additionalSeries")
    if not isinstance(raw, list):
        return []
    targets: list[SeriesDeleteTarget] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        event_id = str(item.get("event_id") or item.get("eventId") or "").strip()
        if not event_id:
            continue
        recurring_raw = item.get("recurring_event_id") or item.get("recurringEventId")
        targets.append(
            SeriesDeleteTarget(
                event_id=event_id,
                recurring_event_id=(
                    str(recurring_raw).strip() if recurring_raw else None
                ),
                summary=str(item.get("summary") or ""),
                start=str(item.get("start") or ""),
                end=str(item.get("end") or ""),
            )
        )
    return targets


def draft_from_payload(payload: dict[str, Any]) -> CalendarDeleteDraft:
    """Rehydrate draft from REST or conversation storage."""
    recurring_raw = payload.get("recurring_event_id") or payload.get("recurringEventId")
    recurring_event_id = (
        str(recurring_raw).strip() if recurring_raw else None
    ) or None
    is_recurring = bool(payload.get("is_recurring"))
    if not is_recurring and recurring_event_id:
        is_recurring = True
    recurrence_label = payload.get("recurrence_label") or payload.get("recurrenceLabel")
    if not is_recurring and recurrence_label:
        is_recurring = True
    return CalendarDeleteDraft(
        tool_name=str(payload.get("tool_name") or "google_workspace"),
        calendar_id=str(payload.get("calendar_id") or "primary"),
        event_id=str(payload.get("event_id") or payload.get("eventId") or ""),
        recurring_event_id=recurring_event_id,
        summary=str(payload.get("summary") or ""),
        start=str(payload.get("start") or payload.get("startIso") or ""),
        end=str(payload.get("end") or payload.get("endIso") or ""),
        is_recurring=is_recurring,
        recurrence_label=(
            str(recurrence_label) if recurrence_label else None
        ),
        source_text=str(payload.get("source_text") or payload.get("sourceText") or ""),
        standalone_event_ids=[
            str(x) for x in (payload.get("standalone_event_ids") or payload.get("standaloneEventIds") or []) if str(x).strip()
        ],
        additional_series=_additional_series_from_payload(payload),
    )


def format_delete_completion(draft: CalendarDeleteDraft, result: Any, scope: RecurrenceScope) -> str:
    """Follow-up text after a confirmed delete."""
    if isinstance(result, dict) and result.get("ok"):
        data = result.get("data") if isinstance(result.get("data"), dict) else {}
        count = int(data.get("deleted_count") or 1)
        scope_label = {
            "this_instance": "that occurrence",
            "this_and_following": "that and future occurrences",
            "all_series": "the entire series",
        }.get(scope, "the event")
        return (
            f"[TOOL_RESULT calendar_delete] DONE: Removed {count} event(s) — {scope_label} "
            f"({draft.summary}). Tell the user in one short sentence."
        )
    err = "it didn't work"
    if isinstance(result, dict):
        err = str(result.get("error") or err).strip()
    return (
        f"[TOOL_RESULT calendar_delete] FAILED: {err} "
        "Tell the user in one short sentence what went wrong."
    )
