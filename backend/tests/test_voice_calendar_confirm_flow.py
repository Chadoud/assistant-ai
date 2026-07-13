"""Tests for duplicate recap and confirm-at-tool-call handling."""

from voice.calendar_create_confirm import (
    CalendarConfirmActionKind,
    CalendarCreateDraft,
    parse_calendar_confirm_response,
)
from voice.tool_dispatch import ToolDispatchState, _resolve_calendar_create_tool_result


def _lake_draft() -> CalendarCreateDraft:
    return CalendarCreateDraft(
        tool_name="google_workspace",
        args={
            "operation": "create_calendar_event",
            "summary": "Go by the lake",
            "start": "2026-06-18T15:00:00+02:00",
            "end": "2026-06-18T16:00:00+02:00",
        },
        source_text="went for tomorrow so I don't forget to go by the lake at 3 pm.",
        summary="Go by the lake",
        start="2026-06-18T15:00:00+02:00",
        end="2026-06-18T16:00:00+02:00",
        title_field="summary",
    )


def test_duplicate_tool_call_returns_same_recap_not_new_draft():
    state = ToolDispatchState()
    state.pending_calendar_create = _lake_draft()
    result = _resolve_calendar_create_tool_result(
        "google_workspace",
        {"operation": "create_calendar_event"},
        "went for tomorrow so I don't forget to go by the lake at 3 pm.",
        state,
    )
    assert result["data"]["status"] == "needs_confirmation"
    assert state.pending_calendar_create is not None
    assert "Go by the lake" in result["data"]["recap"]


def test_oui_at_tool_call_is_confirm_action():
    draft = _lake_draft()
    action = parse_calendar_confirm_response("Oui.", draft)
    assert action.kind == CalendarConfirmActionKind.CONFIRM


def test_tool_result_blocks_promise_nudge_for_needs_confirmation():
    from voice.calendar_create_confirm import (
        needs_confirmation_tool_result,
        tool_result_blocks_promise_nudge,
    )

    result = needs_confirmation_tool_result(_lake_draft())
    assert tool_result_blocks_promise_nudge(result) is True
