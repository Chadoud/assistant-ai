"""Pending calendar delete draft — built from list matches."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .recurrence import describe_recurrence_label, event_is_recurring_instance


@dataclass
class SeriesDeleteTarget:
    """One recurring series bundled into a multi-series delete draft."""

    event_id: str
    recurring_event_id: str | None
    summary: str
    start: str
    end: str


@dataclass
class CalendarDeleteDraft:
    """One delete target awaiting scope confirmation."""

    tool_name: str
    calendar_id: str
    event_id: str
    recurring_event_id: str | None
    summary: str
    start: str
    end: str
    is_recurring: bool
    recurrence_label: str | None
    source_text: str
    standalone_event_ids: list[str] = field(default_factory=list)
    additional_series: list[SeriesDeleteTarget] = field(default_factory=list)
    confirm_state: str = "awaiting"


def build_delete_draft_from_event(
    event: dict[str, Any],
    *,
    tool_name: str = "google_workspace",
    calendar_id: str = "primary",
    source_text: str = "",
    standalone_event_ids: list[str] | None = None,
) -> CalendarDeleteDraft:
    """Build a delete draft from one listed calendar event dict."""
    recurring_id = str(
        event.get("recurring_event_id") or event.get("recurringEventId") or ""
    ).strip() or None
    recurrence_rules = event.get("recurrence")
    is_recurring = (
        bool(recurring_id)
        or bool(recurrence_rules)
        or event_is_recurring_instance(event)
    )
    label = None
    if isinstance(recurrence_rules, list):
        label = describe_recurrence_label([str(r) for r in recurrence_rules])

    return CalendarDeleteDraft(
        tool_name=tool_name,
        calendar_id=calendar_id,
        event_id=str(event.get("id") or "").strip(),
        recurring_event_id=recurring_id,
        summary=str(event.get("summary") or event.get("subject") or "(no title)").strip(),
        start=str(event.get("start") or "").strip(),
        end=str(event.get("end") or "").strip(),
        is_recurring=is_recurring,
        recurrence_label=label,
        source_text=source_text.strip(),
        standalone_event_ids=list(standalone_event_ids or []),
    )


def collapse_delete_targets(
    events: list[dict[str, Any]],
    matched_ids: list[str],
) -> tuple[list[str], list[dict[str, Any]]]:
    """
    Split matched ids into standalone deletes and one representative per recurring series.

    Returns ``(standalone_event_ids, series_representative_events)``.
    """
    by_id = {str(e.get("id") or ""): e for e in events if e.get("id")}
    series: dict[str, dict[str, Any]] = {}
    standalone: list[str] = []
    for eid in matched_ids:
        ev = by_id.get(eid)
        if not ev:
            continue
        rid = str(ev.get("recurring_event_id") or ev.get("recurringEventId") or "").strip()
        if rid:
            series.setdefault(rid, ev)
        else:
            standalone.append(eid)
    return standalone, list(series.values())


def resolve_delete_draft_from_events(
    draft: CalendarDeleteDraft,
    events: list[dict[str, Any]],
) -> CalendarDeleteDraft:
    """
    Fill missing event_id / recurring_event_id on a client-synced or verbal draft.

    UI sync and model recaps sometimes omit IDs; listed calendar rows are authoritative.
    """
    has_instance_id = bool(draft.event_id.strip())
    has_master_id = bool(draft.recurring_event_id)
    if has_instance_id and (has_master_id or not draft.is_recurring):
        return draft

    from .delete_needle import match_calendar_events_for_delete

    needle = draft.summary.strip() or draft.source_text.strip()
    matched_ids = match_calendar_events_for_delete(events, needle)
    if not matched_ids:
        return draft

    by_id = {str(e.get("id") or ""): e for e in events if e.get("id")}
    chosen: dict[str, Any] | None = None
    start_prefix = draft.start[:10] if draft.start else ""
    for event_id in matched_ids:
        row = by_id.get(event_id)
        if not row:
            continue
        if start_prefix and str(row.get("start") or "").startswith(start_prefix):
            chosen = row
            break
        if chosen is None:
            chosen = row

    if chosen is None:
        return draft

    rebuilt = build_delete_draft_from_event(
        chosen,
        tool_name=draft.tool_name,
        calendar_id=draft.calendar_id,
        source_text=draft.source_text or draft.summary,
        standalone_event_ids=draft.standalone_event_ids,
    )
    rebuilt.additional_series = draft.additional_series
    return rebuilt
