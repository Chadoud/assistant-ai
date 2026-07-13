"""Unit tests for scoped calendar delete executors."""

from __future__ import annotations

from typing import Any

from services.calendar.delete_execute import execute_scoped_delete


def _dispatch_recorder(calls: list[dict[str, Any]]):
    def _dispatch(tool: str, params: dict[str, Any]) -> dict[str, Any]:
        calls.append({"tool": tool, "params": params})
        op = str(params.get("operation") or "")
        if op == "get_calendar_event":
            return {
                "ok": True,
                "data": {
                    "recurrence": ["RRULE:FREQ=WEEKLY;BYDAY=TU"],
                    "start_time_zone": "Europe/Paris",
                },
            }
        if op == "patch_calendar_recurrence":
            return {"ok": True, "data": {"patched": True}}
        if op == "list_calendar_instances":
            return {
                "ok": True,
                "data": {
                    "events": [
                        {"id": "inst1"},
                        {"id": "inst2"},
                    ],
                },
            }
        return {"ok": True, "data": {"deleted_event_id": params.get("event_id")}}

    return _dispatch


def test_delete_this_instance_only() -> None:
    calls: list[dict[str, Any]] = []
    result = execute_scoped_delete(
        tool_name="google_workspace",
        scope="this_instance",
        calendar_id="primary",
        event_id="standup20260618T100000Z",
        recurring_event_id="abc123standupmaster",
        instance_start="2026-06-18T10:00:00+02:00",
        dispatch=_dispatch_recorder(calls),
    )
    assert result.get("ok") is True
    assert len(calls) == 1
    assert calls[0]["params"]["event_id"] == "standup20260618T100000Z"


def test_delete_all_series() -> None:
    calls: list[dict[str, Any]] = []
    result = execute_scoped_delete(
        tool_name="google_workspace",
        scope="all_series",
        calendar_id="primary",
        event_id="standup20260618T100000Z",
        recurring_event_id="abc123standupmaster",
        instance_start="2026-06-18T10:00:00+02:00",
        dispatch=_dispatch_recorder(calls),
    )
    assert result.get("ok") is True
    assert calls[0]["params"]["event_id"] == "abc123standupmaster"


def test_delete_this_and_following_google() -> None:
    calls: list[dict[str, Any]] = []
    result = execute_scoped_delete(
        tool_name="google_workspace",
        scope="this_and_following",
        calendar_id="primary",
        event_id="standup20260618T100000Z",
        recurring_event_id="abc123standupmaster",
        instance_start="2026-06-18T10:00:00+02:00",
        dispatch=_dispatch_recorder(calls),
    )
    assert result.get("ok") is True
    data = result.get("data")
    assert isinstance(data, dict)
    assert data.get("scope") == "this_and_following"
    ops = [c["params"]["operation"] for c in calls]
    assert "get_calendar_event" in ops
    assert "patch_calendar_recurrence" in ops
    assert "delete_calendar_event" in ops


def test_delete_this_and_following_partial_failure_message() -> None:
    calls: list[dict[str, Any]] = []

    def _dispatch(tool: str, params: dict[str, Any]) -> dict[str, Any]:
        calls.append({"tool": tool, "params": params})
        op = str(params.get("operation") or "")
        if op == "get_calendar_event":
            return {
                "ok": True,
                "data": {
                    "recurrence": ["RRULE:FREQ=WEEKLY;BYDAY=TU"],
                    "start_time_zone": "Europe/Paris",
                },
            }
        if op == "patch_calendar_recurrence":
            return {"ok": True, "data": {}}
        if op == "list_calendar_instances":
            return {"ok": True, "data": {"events": [{"id": "inst1"}, {"id": "inst2"}]}}
        if params.get("event_id") == "inst2":
            return {"ok": False, "error": "forbidden"}
        return {"ok": True, "data": {}}

    result = execute_scoped_delete(
        tool_name="google_workspace",
        scope="this_and_following",
        calendar_id="primary",
        event_id="standup20260618T100000Z",
        recurring_event_id="abc123standupmaster",
        instance_start="2026-06-18T10:00:00+02:00",
        dispatch=_dispatch,
    )
    assert result.get("ok") is True
    assert "partial" in str(result.get("error") or "").lower() or result["data"].get("partial_failure")


def test_microsoft_delete_all_series() -> None:
    calls: list[dict[str, Any]] = []
    execute_scoped_delete(
        tool_name="microsoft_graph",
        scope="all_series",
        calendar_id="primary",
        event_id="occurrence1",
        recurring_event_id="seriesMaster1",
        instance_start="2026-06-18T10:00:00+02:00",
        dispatch=_dispatch_recorder(calls),
    )
    assert calls[0]["tool"] == "microsoft_graph"
    assert calls[0]["params"]["event_id"] == "seriesMaster1"
