"""Tests for recurring calendar delete propose/confirm flow."""

from __future__ import annotations

from typing import Any

import pytest

from services.calendar.delete_confirm import (
    parse_delete_confirm_response,
    parse_delete_scope,
)
from services.calendar.delete_draft import (
    CalendarDeleteDraft,
    build_delete_draft_from_event,
    collapse_delete_targets,
)
from services.calendar.recurrence import describe_recurrence_label
from services.calendar.service import CalendarService, calendar_delete_confirm_enabled


def _standup_instance() -> dict[str, Any]:
    return {
        "id": "standup20260618T100000Z",
        "summary": "Weekly standup",
        "start": "2026-06-18T10:00:00+02:00",
        "end": "2026-06-18T10:30:00+02:00",
        "recurring_event_id": "abc123standupmaster",
    }


def _budget_single() -> dict[str, Any]:
    return {
        "id": "budget_review_single",
        "summary": "Budget review",
        "start": "2026-06-19T14:00:00+02:00",
        "end": "2026-06-19T15:00:00+02:00",
    }


def test_collapse_delete_targets_groups_recurring_series() -> None:
    events = [_standup_instance(), {**_standup_instance(), "id": "standup20260625T100000Z"}, _budget_single()]
    standalone, series = collapse_delete_targets(
        events,
        ["standup20260618T100000Z", "standup20260625T100000Z", "budget_review_single"],
    )
    assert standalone == ["budget_review_single"]
    assert len(series) == 1
    assert series[0]["recurring_event_id"] == "abc123standupmaster"


def test_build_delete_draft_marks_recurring_instance() -> None:
    draft = build_delete_draft_from_event(_standup_instance(), source_text="delete standup")
    assert draft.is_recurring is True
    assert draft.recurring_event_id == "abc123standupmaster"


def test_describe_recurrence_label_weekly() -> None:
    label = describe_recurrence_label(["RRULE:FREQ=WEEKLY;BYDAY=TU"])
    assert label == "every Tuesday"


@pytest.mark.parametrize(
    ("text", "scope"),
    [
        ("just this one", "this_instance"),
        ("this and following", "this_and_following"),
        ("toute la série", "all_series"),
        ("entire series please", "all_series"),
        ("nur diesen", "this_instance"),
        ("gesamte serie", "all_series"),
        ("questo e i successivi", "this_and_following"),
    ],
)
def test_parse_delete_scope(text: str, scope: str) -> None:
    assert parse_delete_scope(text) == scope


def test_parse_delete_confirm_rejects_plain_yes_for_recurring() -> None:
    draft = CalendarDeleteDraft(
        tool_name="google_workspace",
        calendar_id="primary",
        event_id="evt1",
        recurring_event_id="master1",
        summary="Weekly standup",
        start="2026-06-18T10:00:00+02:00",
        end="2026-06-18T10:30:00+02:00",
        is_recurring=True,
        recurrence_label="every Tuesday",
        source_text="delete standup",
    )
    action = parse_delete_confirm_response("yes", draft)
    assert action.kind.value == "none"


def test_parse_all_of_them_as_all_series_for_single_recurring() -> None:
    draft = CalendarDeleteDraft(
        tool_name="google_workspace",
        calendar_id="primary",
        event_id="snack1",
        recurring_event_id="series-snack",
        summary="Snack",
        start="2026-06-29T12:30:00+02:00",
        end="2026-06-29T12:45:00+02:00",
        is_recurring=True,
        recurrence_label="on a schedule",
        source_text="delete all snack events on my calendar",
    )
    action = parse_delete_confirm_response("All of them.", draft)
    assert action.kind.value == "scope"
    assert action.scope == "all_series"


def test_plan_delete_needs_scope_for_recurring(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ASSISTANT_CALENDAR_DELETE_CONFIRM", "1")
    service = CalendarService()
    response = service.plan_delete_from_events(
        [_standup_instance()],
        ["standup20260618T100000Z"],
        "delete weekly standup",
    )
    assert response.status == "needs_scope"
    assert response.draft is not None
    assert response.draft.is_recurring is True


def test_plan_delete_immediate_bulk_for_standalone(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ASSISTANT_CALENDAR_DELETE_CONFIRM", "1")

    def fake_bulk(self, body: Any) -> dict[str, Any]:
        return {"ok": True, "data": {"deleted_count": len(body.event_ids)}}

    monkeypatch.setattr(CalendarService, "bulk_delete", fake_bulk)
    service = CalendarService()
    result = service.plan_delete_from_events(
        [_budget_single()],
        ["budget_review_single"],
        "delete budget review",
    )
    assert isinstance(result, dict)
    assert result["data"]["deleted_count"] == 1


def test_delete_confirm_flag_default_on() -> None:
    assert calendar_delete_confirm_enabled() is True


def test_delete_tool_result_for_plan_needs_scope(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ASSISTANT_CALENDAR_DELETE_CONFIRM", "1")
    service = CalendarService()
    result = service.delete_tool_result_for_plan(
        [_standup_instance()],
        ["standup20260618T100000Z"],
        "delete weekly standup",
    )
    assert result.get("ok") is True
    data = result.get("data")
    assert isinstance(data, dict)
    assert data.get("status") == "needs_scope"
    assert isinstance(data.get("draft"), dict)


def test_confirm_delete_reject_cancels_without_api_call(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ASSISTANT_CALENDAR_DELETE_CONFIRM", "1")
    calls: list[Any] = []

    def _fake_execute(*_args, **_kwargs):
        calls.append(True)
        return {"ok": True, "data": {"deleted_count": 1}}

    monkeypatch.setattr("services.calendar.service.execute_scoped_delete", _fake_execute)
    service = CalendarService()
    draft = build_delete_draft_from_event(_budget_single(), source_text="delete budget")
    from services.calendar.schemas import CalendarDeleteDraftPayload, ConfirmCalendarDeleteRequest

    response = service.confirm_delete(
        ConfirmCalendarDeleteRequest(
            draft=CalendarDeleteDraftPayload(
                tool_name=draft.tool_name,
                event_id=draft.event_id,
                summary=draft.summary,
                start=draft.start,
                end=draft.end,
                is_recurring=False,
            ),
            user_reply="non annule",
        )
    )
    assert response.status == "cancelled"
    assert calls == []


def test_confirm_delete_this_and_following(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ASSISTANT_CALENDAR_DELETE_CONFIRM", "1")
    captured: list[str] = []

    def _fake_execute(*, scope, **_kwargs):
        captured.append(scope)
        return {"ok": True, "data": {"deleted_count": 2, "scope": scope}}

    monkeypatch.setattr("services.calendar.service.execute_scoped_delete", _fake_execute)
    service = CalendarService()
    draft = build_delete_draft_from_event(_standup_instance(), source_text="delete standup")
    from services.calendar.schemas import CalendarDeleteDraftPayload, ConfirmCalendarDeleteRequest

    response = service.confirm_delete(
        ConfirmCalendarDeleteRequest(
            draft=CalendarDeleteDraftPayload(
                tool_name=draft.tool_name,
                event_id=draft.event_id,
                recurring_event_id=draft.recurring_event_id,
                summary=draft.summary,
                start=draft.start,
                end=draft.end,
                is_recurring=True,
            ),
            scope="this_and_following",
        )
    )
    assert response.status == "deleted"
    assert captured == ["this_and_following"]


def test_parse_delete_scope_following_recurrencies() -> None:
    assert parse_delete_scope("All the following recurrencies.") == "this_and_following"
    assert parse_delete_scope("all following recurrences") == "this_and_following"


def test_plan_delete_rematches_from_source_text_when_ids_miss_cache(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    events = [
        {
            "id": "work1",
            "summary": "WORK",
            "start": "2026-06-18T09:00:00+02:00",
            "end": "2026-06-18T10:00:00+02:00",
            "recurring_event_id": "series-work",
        }
    ]
    service = CalendarService()
    monkeypatch.setattr(
        "services.calendar.service.calendar_delete_confirm_enabled",
        lambda: True,
    )
    plan = service.plan_delete_from_events(
        events,
        ["bogus-id-from-model"],
        "delete all my WORK events",
    )
    from services.calendar.schemas import CalendarDeleteResponse

    assert isinstance(plan, CalendarDeleteResponse)
    assert plan.status == "needs_scope"
