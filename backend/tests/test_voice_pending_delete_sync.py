"""Pending delete sync holder rehydrates voice dispatch state."""

from voice.pending_delete_sync import PendingDeleteSyncHolder, hydrate_dispatch_pending_delete
from voice.tool_dispatch import ToolDispatchState


def test_hydrate_dispatch_pending_delete_from_client_sync() -> None:
    holder = PendingDeleteSyncHolder(
        draft={
            "tool_name": "google_workspace",
            "calendar_id": "primary",
            "event_id": "evt1",
            "summary": "WORK",
            "start": "2026-06-18T10:00:00+02:00",
            "end": "2026-06-18T11:00:00+02:00",
            "is_recurring": True,
            "source_text": "delete work",
            "standalone_event_ids": [],
            "awaitingConfirm": True,
        }
    )
    state = ToolDispatchState()
    hydrate_dispatch_pending_delete(state, holder)
    assert state.pending_calendar_delete is not None
    assert state.pending_calendar_delete.summary == "WORK"
    assert state.calendar_awaiting_confirm is True


def test_hydrate_skips_when_dispatch_already_has_pending_delete() -> None:
    holder = PendingDeleteSyncHolder(draft={"event_id": "other", "summary": "Other"})
    state = ToolDispatchState()
    from services.calendar.delete_confirm import draft_from_payload

    state.pending_calendar_delete = draft_from_payload(
        {
            "tool_name": "google_workspace",
            "calendar_id": "primary",
            "event_id": "evt1",
            "summary": "WORK",
            "start": "2026-06-18T10:00:00+02:00",
            "end": "2026-06-18T11:00:00+02:00",
            "is_recurring": False,
            "source_text": "delete work",
            "standalone_event_ids": [],
        }
    )
    hydrate_dispatch_pending_delete(state, holder)
    assert state.pending_calendar_delete.summary == "WORK"
