"""Turn-complete delete confirm — resolve IDs from list cache."""

from __future__ import annotations

from services.calendar.delete_draft import CalendarDeleteDraft
from voice.tool_dispatch import ToolDispatchState, process_pending_calendar_delete_confirm


def test_turn_complete_all_of_them_resolves_ids_and_deletes_series(monkeypatch) -> None:
    monkeypatch.setenv("ASSISTANT_CALENDAR_DELETE_CONFIRM", "1")

    deleted: list[tuple[str, str | None]] = []

    class FakeCalendarService:
        def fetch_events_for_delete(self, _tool: str, *, needle: str | None = None, calendar_id: str = "primary"):
            return [
                {
                    "id": "snack-instance-1",
                    "summary": "snack",
                    "start": "2026-06-19T15:00:00+02:00",
                    "end": "2026-06-19T16:00:00+02:00",
                    "recurring_event_id": "snack-master-1",
                }
            ]

        def delete_with_scope(self, draft, scope):
            deleted.append((draft.event_id, scope))
            return {"ok": True, "data": {"deleted_count": 1, "scope": scope}}

    monkeypatch.setattr("voice.tool_dispatch.get_calendar_service", FakeCalendarService)

    state = ToolDispatchState()
    state.pending_calendar_delete = CalendarDeleteDraft(
        tool_name="google_workspace",
        calendar_id="primary",
        event_id="",
        recurring_event_id=None,
        summary="snack",
        start="2026-06-19T15:00:00+02:00",
        end="2026-06-19T16:00:00+02:00",
        is_recurring=False,
        recurrence_label=None,
        source_text="Delete all the snacks events",
    )

    pending_results: list[str] = []
    handled = process_pending_calendar_delete_confirm(
        "All of them motherfucker.",
        state,
        pending_results,
    )

    assert handled is True
    assert state.pending_calendar_delete is None
    assert deleted == [("snack-instance-1", "all_series")]
