"""Tests for calendar stt_race retry gate."""

from voice.tool_dispatch import ToolDispatchState, _should_retry_calendar_stt_race
from voice.turn_trace import VoiceTurnTraceEntry


def test_stt_race_retry_when_tool_failed() -> None:
    state = ToolDispatchState()
    state.last_trace_at_tool = VoiceTurnTraceEntry(
        commit_reason="tool_call",
        stt_chunk_count=1,
        canonical_at_tool="paddle demain à midi",
        canonical_at_turn_complete="paddle",
        tool_name="google_workspace",
        tool_operation="create_calendar_event",
        stt_race=True,
    )
    args = {"operation": "create_calendar_event"}
    result = {"ok": False, "error": "summary required"}
    assert _should_retry_calendar_stt_race(state, "google_workspace", args, result) is True


def test_no_stt_race_retry_when_already_retried() -> None:
    state = ToolDispatchState()
    state.last_trace_at_tool = VoiceTurnTraceEntry(
        commit_reason="tool_call",
        stt_chunk_count=1,
        canonical_at_tool="x",
        canonical_at_turn_complete="",
        stt_race=True,
    )
    args = {"operation": "create_calendar_event", "_calendar_stt_race_retried": True}
    result = {"ok": False, "error": "fail"}
    assert _should_retry_calendar_stt_race(state, "google_workspace", args, result) is False
