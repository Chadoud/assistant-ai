"""Tests for schedule_reminder → calendar redirect and delete routing."""

from services.routing import RouteContext, get_capability_router
from voice.tool_args import resolve_voice_tool_call


def test_redirects_bourbon_request_from_schedule_reminder() -> None:
    speech = "pour demain, pour que j'aille acheter du bourbon à Turinsev"
    name, args = resolve_voice_tool_call("schedule_reminder", {"message": "buy bourbon"}, speech)
    assert name == "google_workspace"
    assert args.get("operation") == "create_calendar_event"
    assert "bourbon" in str(args.get("summary", "")).lower()


def test_keeps_true_reminder_requests() -> None:
    speech = "rappelle-moi dans 20 minutes de sortir les pâtes"
    name, args = resolve_voice_tool_call("schedule_reminder", {"message": "pâtes"}, speech)
    assert name == "schedule_reminder"
    assert args.get("message") == "pâtes"


def test_delete_all_work_events_uses_bulk_delete_path() -> None:
    events = [
        {"id": "e1", "summary": "WORK sync"},
        {"id": "e2", "summary": "WORK retro"},
        {"id": "e3", "summary": "Lunch"},
    ]
    ctx = RouteContext(
        user_speech="delete all WORK events from my calendar",
        last_listed_calendar_events=events,
    )
    routed = get_capability_router().route(
        "plan_and_execute",
        {"goal": "delete all WORK events from my calendar"},
        ctx,
    )
    assert routed.name == "google_workspace"
    assert routed.bulk_delete_event_ids == ["e1", "e2"]
    assert routed.redirected is True


def test_recurring_work_events_collapse_to_one_bulk_target() -> None:
    """Multiple WORK instances of one series should still route as one bulk delete set."""
    events = [
        {
            "id": "work1",
            "summary": "WORK sync",
            "recurring_event_id": "work-master",
        },
        {
            "id": "work2",
            "summary": "WORK retro",
            "recurring_event_id": "work-master",
        },
        {"id": "e3", "summary": "Lunch"},
    ]
    ctx = RouteContext(
        user_speech="delete all WORK events from my calendar",
        last_listed_calendar_events=events,
        last_calendar_list_tool="microsoft_graph",
    )
    routed = get_capability_router().route(
        "plan_and_execute",
        {"goal": "delete all WORK events from my calendar"},
        ctx,
    )
    assert routed.bulk_delete_event_ids == ["work1", "work2"]
    assert routed.bulk_delete_tool_name == "microsoft_graph"
