"""Multi-series calendar delete — same-title WORK masters and bulk-all-matched flows."""

from __future__ import annotations

import re
from typing import Any, Callable

from .delete_draft import CalendarDeleteDraft, SeriesDeleteTarget, build_delete_draft_from_event
from .delete_execute import execute_scoped_delete
from .schemas import RecurrenceScope

DispatchFn = Callable[[str, dict[str, Any]], dict[str, Any]]

_BULK_ALL_MATCHED_RE = re.compile(
    r"\b("
    r"all\s+of\s+(?:them|those|these|it|fucking\s+them|fucking\s+those)|"
    r"delete\s+all(?:\s+of)?\s+them|"
    r"just\s+all\s+of\s+them|"
    r"yeah\s*,?\s*delete\s+all(?:\s+of\s+them)?|"
    r"every\s+one(?:\s+of\s+them)?|"
    r"all\s+of\s+fucking\s+them|"
    r"tous(?:\s+les)?|"
    r"supprim(?:e|er)\s+tous"
    r")\b",
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


def normalize_event_title(summary: str) -> str:
    """Lowercase title for same-series batch grouping."""
    return " ".join(summary.strip().lower().split())


def is_bulk_delete_all_matched_intent(text: str) -> bool:
    """True when the user wants every matched recurring series removed."""
    return bool(_BULK_ALL_MATCHED_RE.search(text or ""))


def is_delete_entire_calendar_intent(text: str) -> bool:
    """True when the user asked to wipe the whole calendar, not a scoped follow-up."""
    return bool(_DELETE_ENTIRE_CALENDAR_RE.search(text or ""))


def series_batch_eligible(
    series_events: list[dict[str, Any]],
    source_text: str,
) -> bool:
    """
    Whether multiple recurring series can be proposed as one batch delete.

    Same-title series (e.g. two WORK masters) batch together. Mixed titles
    only batch when the user asked to wipe the whole calendar — bare "all of
    them" after a scoped delete must not pull unrelated series into one batch.
    """
    if len(series_events) <= 1:
        return True
    titles = {normalize_event_title(str(event.get("summary") or "")) for event in series_events}
    if len(titles) == 1 and next(iter(titles)):
        return True
    return is_delete_entire_calendar_intent(source_text)


def _target_from_event(event: dict[str, Any]) -> SeriesDeleteTarget:
    recurring_id = str(
        event.get("recurring_event_id") or event.get("recurringEventId") or ""
    ).strip() or None
    return SeriesDeleteTarget(
        event_id=str(event.get("id") or "").strip(),
        recurring_event_id=recurring_id,
        summary=str(event.get("summary") or event.get("subject") or "(no title)").strip(),
        start=str(event.get("start") or "").strip(),
        end=str(event.get("end") or "").strip(),
    )


def build_batch_delete_draft(
    series_events: list[dict[str, Any]],
    *,
    tool_name: str,
    calendar_id: str,
    source_text: str,
    standalone_event_ids: list[str],
) -> CalendarDeleteDraft:
    """Build one pending draft covering multiple recurring series."""
    primary = build_delete_draft_from_event(
        series_events[0],
        tool_name=tool_name,
        calendar_id=calendar_id,
        source_text=source_text,
        standalone_event_ids=standalone_event_ids,
    )
    primary.additional_series = [_target_from_event(event) for event in series_events[1:]]
    return primary


def batch_series_count(draft: CalendarDeleteDraft) -> int:
    """Number of recurring series represented by a delete draft."""
    return 1 + len(draft.additional_series)


def unique_batch_titles(draft: CalendarDeleteDraft) -> list[str]:
    """Distinct event titles in a batch delete draft."""
    seen: set[str] = set()
    titles: list[str] = []
    for title in [draft.summary, *[target.summary for target in draft.additional_series]]:
        normalized = normalize_event_title(title)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        titles.append(title.strip() or title)
    return titles


def format_batch_delete_recap(draft: CalendarDeleteDraft) -> str:
    """Plain-language recap when multiple recurring series are bundled."""
    count = batch_series_count(draft)
    titles = unique_batch_titles(draft)
    if len(titles) == 1:
        title = titles[0]
        return (
            f"I found {count} recurring \"{title}\" series. "
            "Delete only this occurrence, this and future ones, or the entire series for all of them?"
        )
    joined = ", ".join(titles[:4])
    if len(titles) > 4:
        joined += f", and {len(titles) - 4} more"
    return (
        f"I found {count} recurring series ({joined}). "
        "Delete only this occurrence, this and future ones, or the entire series for all of them?"
    )


def iter_batch_targets(draft: CalendarDeleteDraft) -> list[tuple[str, str | None, str]]:
    """Yield (event_id, recurring_event_id, start) for each series in a batch."""
    targets = [(draft.event_id, draft.recurring_event_id, draft.start)]
    targets.extend(
        (target.event_id, target.recurring_event_id, target.start)
        for target in draft.additional_series
    )
    return targets


def execute_batch_scoped_delete(
    draft: CalendarDeleteDraft,
    scope: RecurrenceScope,
    *,
    dispatch: DispatchFn,
) -> dict[str, Any]:
    """Delete every series in a batch draft with the same recurrence scope."""
    deleted = 0
    errors: list[str] = []
    for event_id, recurring_event_id, instance_start in iter_batch_targets(draft):
        result = execute_scoped_delete(
            tool_name=draft.tool_name,
            scope=scope,
            calendar_id=draft.calendar_id,
            event_id=event_id,
            recurring_event_id=recurring_event_id,
            instance_start=instance_start,
            dispatch=dispatch,
        )
        if isinstance(result, dict) and result.get("ok"):
            data = result.get("data") if isinstance(result.get("data"), dict) else {}
            deleted += int(data.get("deleted_count") or 1)
        else:
            err = str(result.get("error") if isinstance(result, dict) else "delete failed")
            errors.append(err)

    if draft.standalone_event_ids:
        for event_id in draft.standalone_event_ids:
            result = dispatch(
                draft.tool_name,
                {
                    "operation": "delete_calendar_event",
                    "event_id": event_id,
                    "calendar_id": draft.calendar_id,
                },
            )
            if isinstance(result, dict) and result.get("ok"):
                deleted += 1
            else:
                errors.append(
                    str(result.get("error") if isinstance(result, dict) else "delete failed")
                )

    partial = bool(errors)
    return {
        "ok": deleted > 0,
        "data": {
            "deleted_count": deleted,
            "scope": scope,
            "partial_failure": partial,
            "errors": errors,
            "series_deleted": batch_series_count(draft) if deleted else 0,
        },
        "error": (
            f"Removed {deleted} item(s) but {len(errors)} target(s) failed."
            if partial
            else None
        ),
    }
