"""Voice delete follow-up replies — scope confirm, echo bypass, pending rehydrate."""

from __future__ import annotations

from services.calendar.delete_batch import build_batch_delete_draft
from services.calendar.delete_confirm import (
    is_delete_followup_reply,
    parse_delete_confirm_response,
)
from services.calendar.delete_draft import SeriesDeleteTarget
from voice.tool_dispatch import (
    ToolDispatchState,
    _resolve_delete_event_ids,
    _resolve_delete_without_event_id,
    _try_rehydrate_pending_delete,
)


def _work_event(event_id: str, recurring_id: str) -> dict:
    return {
        "id": event_id,
        "summary": "WORK",
        "start": "2026-06-18T08:00:00+02:00",
        "end": "2026-06-18T12:00:00+02:00",
        "recurring_event_id": recurring_id,
    }


def test_is_delete_followup_reply_detects_scope_and_yes() -> None:
    assert is_delete_followup_reply("The entire series.") is True
    assert is_delete_followup_reply("Yes.") is True
    assert is_delete_followup_reply("delete all WORK events") is False


def test_resolve_delete_event_ids_uses_last_needle_for_yes() -> None:
    state = ToolDispatchState(
        last_calendar_delete_needle="work",
        last_listed_calendar_events=[
            _work_event("w1", "series-a"),
            {
                "id": "snack1",
                "summary": "Snack",
                "start": "2026-06-18T10:00:00+02:00",
                "end": "2026-06-18T10:15:00+02:00",
                "recurring_event_id": "series-snack",
            },
        ],
    )
    matched = _resolve_delete_event_ids(
        state.last_listed_calendar_events,
        {},
        "Yes.",
        state,
    )
    assert matched == ["w1"]


def test_resolve_delete_event_ids_all_of_them_scoped_to_last_needle() -> None:
    state = ToolDispatchState(
        last_calendar_delete_needle="work",
        last_calendar_delete_source="Can you delete the work events on my calendar?",
        last_listed_calendar_events=[
            _work_event("w1", "series-a"),
            _work_event("w2", "series-b"),
            {
                "id": "sport1",
                "summary": "Sport Viki / Iann",
                "start": "2026-06-18T10:00:00+02:00",
                "end": "2026-06-18T11:00:00+02:00",
                "recurring_event_id": "series-sport",
            },
        ],
    )
    matched = _resolve_delete_event_ids(
        state.last_listed_calendar_events,
        {},
        "All of them",
        state,
    )
    assert matched == ["w1", "w2"]


def test_try_rehydrate_pending_delete_from_scope_reply(monkeypatch) -> None:
    monkeypatch.setenv("ASSISTANT_CALENDAR_DELETE_CONFIRM", "1")
    state = ToolDispatchState(
        last_calendar_delete_needle="work",
        last_calendar_delete_source="delete all WORK events",
        last_listed_calendar_events=[
            _work_event("w1", "series-a"),
            _work_event("w2", "series-b"),
        ],
        last_calendar_list_tool="google_workspace",
    )
    pending = _try_rehydrate_pending_delete(state, "Yes.")
    assert pending is not None
    assert state.pending_calendar_delete is not None
    assert len(state.pending_calendar_delete.additional_series) == 1


def test_yes_on_batch_draft_maps_to_all_series() -> None:
    draft = build_batch_delete_draft(
        [_work_event("w1", "series-a"), _work_event("w2", "series-b")],
        tool_name="google_workspace",
        calendar_id="primary",
        source_text="delete WORK",
        standalone_event_ids=[],
    )
    draft.additional_series = [
        SeriesDeleteTarget(
            event_id="w2",
            recurring_event_id="series-b",
            summary="WORK",
            start="2026-06-18T14:00:00+02:00",
            end="2026-06-18T18:00:00+02:00",
        )
    ]
    action = parse_delete_confirm_response("Yes.", draft)
    assert action.kind.value == "scope"
    assert action.scope == "all_series"


def test_resolve_delete_without_event_id_discovers_and_executes_all_series(
    monkeypatch,
) -> None:
    monkeypatch.setenv("ASSISTANT_CALENDAR_DELETE_CONFIRM", "1")

    snack_events = [
        {
            "id": "s1",
            "summary": "Snack",
            "start": "2026-06-29T12:30:00+02:00",
            "end": "2026-06-29T13:00:00+02:00",
            "recurring_event_id": "series-snack",
        }
    ]
    deleted_scopes: list[str] = []

    class FakeCalendarService:
        def fetch_events_for_delete(self, _tool: str, *, needle: str | None = None, calendar_id: str = "primary"):
            assert needle == "snack"
            return snack_events

        def delete_tool_result_for_plan(self, events, matched, source, tool_name="google_workspace"):
            from services.calendar.delete_confirm import needs_delete_scope_tool_result
            from services.calendar.delete_draft import build_delete_draft_from_event

            draft = build_delete_draft_from_event(
                events[0],
                tool_name=tool_name,
                source_text=source,
            )
            return needs_delete_scope_tool_result(draft)

        def delete_with_scope(self, draft, scope):
            deleted_scopes.append(scope)
            return {"ok": True, "data": {"deleted_count": 1, "scope": scope}}

    monkeypatch.setattr("voice.tool_dispatch.get_calendar_service", FakeCalendarService)

    state = ToolDispatchState(
        last_calendar_delete_needle="snack",
        last_calendar_delete_source="de snack events my calendar",
    )
    result = _resolve_delete_without_event_id(
        state,
        name="google_workspace",
        args={"operation": "delete_calendar_event"},
        enrich_source="yeah delete all of them.",
    )
    assert result.get("ok") is True
    assert deleted_scopes == ["all_series"]
