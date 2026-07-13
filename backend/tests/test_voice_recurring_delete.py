"""Voice path: recurring delete asks scope before mutating."""

from __future__ import annotations

from voice.tool_dispatch import ToolDispatchState, process_pending_calendar_delete_confirm


def test_voice_recurring_delete_asks_scope() -> None:
    state = ToolDispatchState()
    pending_results: list[str] = []
    from services.calendar.delete_draft import CalendarDeleteDraft

    state.pending_calendar_delete = CalendarDeleteDraft(
        tool_name="google_workspace",
        calendar_id="primary",
        event_id="standup20260618T100000Z",
        recurring_event_id="abc123standupmaster",
        summary="Weekly standup",
        start="2026-06-18T10:00:00+02:00",
        end="2026-06-18T10:30:00+02:00",
        is_recurring=True,
        recurrence_label="every Tuesday",
        source_text="delete standup",
    )

    handled = process_pending_calendar_delete_confirm("yes", state, pending_results)
    assert handled is True
    assert state.pending_calendar_delete is not None
    assert any("scope" in msg.lower() for msg in pending_results)


def test_voice_recurring_delete_scope_consumed(monkeypatch) -> None:
    state = ToolDispatchState()
    pending_results: list[str] = []
    from services.calendar.delete_draft import CalendarDeleteDraft

    state.pending_calendar_delete = CalendarDeleteDraft(
        tool_name="google_workspace",
        calendar_id="primary",
        event_id="standup20260618T100000Z",
        recurring_event_id="abc123standupmaster",
        summary="Weekly standup",
        start="2026-06-18T10:00:00+02:00",
        end="2026-06-18T10:30:00+02:00",
        is_recurring=True,
        recurrence_label="every Tuesday",
        source_text="delete standup",
    )

    class _FakeCalendarService:
        def delete_with_scope(self, _draft, _scope):
            return {"ok": True, "data": {"deleted_count": 1}}

    monkeypatch.setattr(
        "voice.tool_dispatch.get_calendar_service",
        lambda: _FakeCalendarService(),
    )

    handled = process_pending_calendar_delete_confirm("entire series", state, pending_results)
    assert handled is True
    assert state.pending_calendar_delete is None
    assert pending_results


def test_voice_delete_tool_consumes_scope_when_pending(monkeypatch) -> None:
    from voice.tool_dispatch import _resolve_delete_event_ids

    events = [
        {
            "id": "work1",
            "summary": "WORK",
            "start": "2026-06-18T09:00:00+02:00",
            "end": "2026-06-18T10:00:00+02:00",
            "recurring_event_id": "series-work",
        }
    ]
    assert _resolve_delete_event_ids(events, {"event_id": "bogus"}, "delete WORK events") == ["work1"]
