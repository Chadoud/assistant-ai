"""Tests for CapabilityRouter — plan_and_execute and calendar redirects."""

from __future__ import annotations

import pytest

from services.routing import RouteContext, get_capability_router


def _listed_work_events() -> list[dict]:
    return [
        {"id": "evt-work-1", "summary": "WORK standup", "start": "2026-06-18T09:00:00Z"},
        {"id": "evt-work-2", "summary": "WORK review", "start": "2026-06-18T15:00:00Z"},
        {"id": "evt-personal", "summary": "Dentist", "start": "2026-06-19T10:00:00Z"},
    ]


def test_bulk_delete_routes_from_plan_and_execute() -> None:
    ctx = RouteContext(
        user_speech="delete all WORK calendar events",
        last_listed_calendar_events=_listed_work_events(),
    )
    routed = get_capability_router().route(
        "plan_and_execute",
        {"goal": "delete all WORK calendar events"},
        ctx,
    )
    assert routed.redirected is True
    assert routed.name == "google_workspace"
    assert routed.bulk_delete_event_ids == ["evt-work-1", "evt-work-2"]
    assert routed.reason == "plan_to_calendar_bulk_delete"


def test_delete_without_list_cache_routes_to_list() -> None:
    routed = get_capability_router().route(
        "plan_and_execute",
        {"goal": "delete all WORK calendar events"},
        RouteContext(user_speech="delete all WORK calendar events"),
    )
    assert routed.redirected is True
    assert routed.name == "google_workspace"
    assert routed.args.get("operation") == "list_calendar_events"
    assert routed.bulk_delete_event_ids is None
    assert routed.reason == "plan_to_calendar_list_before_delete"


def test_simple_list_routes_from_plan_and_execute() -> None:
    routed = get_capability_router().route(
        "plan_and_execute",
        {"goal": "show my calendar events for today"},
        RouteContext(user_speech="show my calendar events for today"),
    )
    assert routed.redirected is True
    assert routed.name == "google_workspace"
    assert routed.args.get("operation") == "list_calendar_events"
    assert routed.reason == "plan_to_calendar_list"


def test_simple_create_routes_from_plan_and_execute() -> None:
    speech = "schedule paddle with Alexandre tomorrow at noon"
    routed = get_capability_router().route(
        "plan_and_execute",
        {"goal": speech},
        RouteContext(user_speech=speech),
    )
    assert routed.redirected is True
    assert routed.name == "google_workspace"
    assert routed.args.get("operation") == "create_calendar_event"
    assert routed.reason == "plan_to_calendar_create"


def test_complex_goal_keeps_plan_and_execute() -> None:
    goal = "research my latest invoice emails then schedule a meeting about the total"
    routed = get_capability_router().route(
        "plan_and_execute",
        {"goal": goal},
        RouteContext(user_speech=goal),
    )
    assert routed.redirected is False
    assert routed.name == "plan_and_execute"


def test_direct_calendar_list_not_redirected() -> None:
    args = {"operation": "list_calendar_events", "time_min": "2026-06-18T00:00:00Z"}
    routed = get_capability_router().route("google_workspace", args, RouteContext())
    assert routed.redirected is False
    assert routed.name == "google_workspace"
    assert routed.args == args


def test_router_disabled_passthrough(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ASSISTANT_CAPABILITY_ROUTER", "0")
    routed = get_capability_router().route(
        "plan_and_execute",
        {"goal": "delete all WORK calendar events"},
        RouteContext(last_listed_calendar_events=_listed_work_events()),
    )
    assert routed.redirected is False
    assert routed.name == "plan_and_execute"


def test_extract_needle_from_delete_work_events_on_calendar() -> None:
    from services.routing.capability_router import (
        extract_calendar_delete_needle,
        match_calendar_events_for_delete,
    )

    speech = "Can you delete the work events on my calendar?"
    assert extract_calendar_delete_needle(speech) == "work"
    events = _listed_work_events()
    assert match_calendar_events_for_delete(events, extract_calendar_delete_needle(speech)) == [
        "evt-work-1",
        "evt-work-2",
    ]


def test_null_needle_does_not_match_every_event() -> None:
    from services.routing.capability_router import match_calendar_events_for_delete

    assert match_calendar_events_for_delete(_listed_work_events(), None) == []
