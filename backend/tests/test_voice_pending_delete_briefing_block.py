"""Briefing tools are blocked while a calendar delete awaits confirmation."""

from services.calendar.delete_confirm import draft_from_payload
from voice.tool_dispatch import ToolDispatchState, _briefing_tool_block_result


def _pending_state() -> ToolDispatchState:
    state = ToolDispatchState()
    state.pending_calendar_delete = draft_from_payload(
        {
            "tool_name": "google_workspace",
            "calendar_id": "primary",
            "event_id": "evt1",
            "summary": "WORK",
            "start": "2026-06-18T10:00:00+02:00",
            "end": "2026-06-18T11:00:00+02:00",
            "is_recurring": True,
            "source_text": "delete work",
            "standalone_event_ids": [],
        }
    )
    state.calendar_awaiting_confirm = True
    return state


def test_run_startup_briefing_blocked_during_pending_delete() -> None:
    state = _pending_state()
    blocked = _briefing_tool_block_result(state, "run_startup_briefing", {})
    assert blocked is not None
    assert blocked["ok"] is False
    assert "delete" in blocked["error"].lower()


def test_save_memory_briefing_consent_blocked_during_pending_delete() -> None:
    state = _pending_state()
    blocked = _briefing_tool_block_result(
        state,
        "save_memory",
        {"category": "preferences", "key": "startup_briefing_consent", "value": "granted"},
    )
    assert blocked is not None
    assert blocked["ok"] is False


def test_briefing_tools_allowed_without_pending_delete() -> None:
    state = ToolDispatchState()
    assert _briefing_tool_block_result(state, "run_startup_briefing", {}) is None
