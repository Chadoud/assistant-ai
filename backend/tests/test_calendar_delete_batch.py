"""Tests for multi-series calendar delete batching."""

from __future__ import annotations

from typing import Any

import pytest

from services.calendar.delete_batch import (
    build_batch_delete_draft,
    execute_batch_scoped_delete,
    format_batch_delete_recap,
    is_bulk_delete_all_matched_intent,
    series_batch_eligible,
)
from services.calendar.delete_confirm import draft_from_payload, parse_delete_confirm_response
from services.calendar.schemas import CalendarDeleteResponse
from services.calendar.service import CalendarService


def _work_series(event_id: str, recurring_id: str, start: str) -> dict[str, Any]:
    return {
        "id": event_id,
        "summary": "WORK",
        "start": start,
        "end": start,
        "recurring_event_id": recurring_id,
    }


def _snack_series() -> dict[str, Any]:
    return {
        "id": "snack1",
        "summary": "Snack",
        "start": "2026-06-29T10:00:00+02:00",
        "end": "2026-06-29T10:15:00+02:00",
        "recurring_event_id": "series-snack",
    }


def test_series_batch_eligible_for_same_title() -> None:
    series = [
        _work_series("w1", "series-a", "2026-06-18T08:00:00+02:00"),
        _work_series("w2", "series-b", "2026-06-18T14:00:00+02:00"),
    ]
    assert series_batch_eligible(series, "delete all WORK events") is True


def test_series_batch_eligible_for_mixed_titles_with_bulk_intent() -> None:
    series = [
        _work_series("w1", "series-a", "2026-06-18T08:00:00+02:00"),
        _snack_series(),
    ]
    assert series_batch_eligible(series, "yeah delete all of them") is False
    assert series_batch_eligible(series, "delete everything on my calendar") is True
    assert series_batch_eligible(series, "delete WORK only") is False


@pytest.mark.parametrize(
    "text",
    [
        "All of them, just all of them.",
        "yeah delete all of them",
        "I said all the events, not today, all of fucking them",
        "tous les events work sur mon calendrier",
    ],
)
def test_bulk_delete_all_matched_intent(text: str) -> None:
    assert is_bulk_delete_all_matched_intent(text) is True


def test_plan_delete_multiple_work_series_returns_needs_scope(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ASSISTANT_CALENDAR_DELETE_CONFIRM", "1")
    events = [
        _work_series("w1", "series-a", "2026-06-18T08:00:00+02:00"),
        _work_series("w2", "series-b", "2026-06-18T14:00:00+02:00"),
        _work_series("w3", "series-a", "2026-06-19T08:00:00+02:00"),
        _snack_series(),
    ]
    service = CalendarService()
    plan = service.plan_delete_from_events(
        events,
        ["w1", "w2", "w3", "snack1"],
        "Can you delete the work events on my calendar?",
    )
    assert isinstance(plan, CalendarDeleteResponse)
    assert plan.status == "needs_scope"
    assert plan.draft is not None
    assert plan.draft.summary == "WORK"
    assert len(plan.draft.additional_series) == 1


def test_confirm_delete_all_series_deletes_every_work_master(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ASSISTANT_CALENDAR_DELETE_CONFIRM", "1")
    deleted_masters: list[str] = []

    def _fake_execute(*, recurring_event_id, scope, **_kwargs):
        if scope == "all_series" and recurring_event_id:
            deleted_masters.append(recurring_event_id)
        return {"ok": True, "data": {"deleted_count": 1, "scope": scope}}

    monkeypatch.setattr("services.calendar.delete_batch.execute_scoped_delete", _fake_execute)
    service = CalendarService()
    draft = build_batch_delete_draft(
        [
            _work_series("w1", "series-a", "2026-06-18T08:00:00+02:00"),
            _work_series("w2", "series-b", "2026-06-18T14:00:00+02:00"),
        ],
        tool_name="google_workspace",
        calendar_id="primary",
        source_text="delete all WORK events",
        standalone_event_ids=[],
    )
    from services.calendar.schemas import ConfirmCalendarDeleteRequest

    response = service.confirm_delete(
        ConfirmCalendarDeleteRequest(
            draft=service._draft_to_delete_payload(draft),
            scope="all_series",
        )
    )
    assert response.status == "deleted"
    assert sorted(deleted_masters) == ["series-a", "series-b"]


def test_parse_all_of_them_as_all_series_for_batch_draft() -> None:
    payload = build_batch_delete_draft(
        [
            _work_series("w1", "series-a", "2026-06-18T08:00:00+02:00"),
            _work_series("w2", "series-b", "2026-06-18T14:00:00+02:00"),
        ],
        tool_name="google_workspace",
        calendar_id="primary",
        source_text="delete all of them",
        standalone_event_ids=[],
    )
    action = parse_delete_confirm_response("All of them", payload)
    assert action.kind.value == "scope"
    assert action.scope == "all_series"


def test_execute_batch_scoped_delete_aggregates_counts() -> None:
    calls: list[str] = []

    def _dispatch(tool: str, params: dict[str, Any]) -> dict[str, Any]:
        calls.append(str(params.get("event_id")))
        return {"ok": True, "data": {"deleted_count": 1}}

    draft = build_batch_delete_draft(
        [
            _work_series("w1", "series-a", "2026-06-18T08:00:00+02:00"),
            _work_series("w2", "series-b", "2026-06-18T14:00:00+02:00"),
        ],
        tool_name="google_workspace",
        calendar_id="primary",
        source_text="delete all WORK events",
        standalone_event_ids=["solo1"],
    )
    result = execute_batch_scoped_delete(draft, "all_series", dispatch=_dispatch)
    assert result["ok"] is True
    assert result["data"]["deleted_count"] == 3
    assert calls == ["series-a", "series-b", "solo1"]


def test_format_batch_delete_recap_same_title() -> None:
    draft = build_batch_delete_draft(
        [
            _work_series("w1", "series-a", "2026-06-18T08:00:00+02:00"),
            _work_series("w2", "series-b", "2026-06-18T14:00:00+02:00"),
        ],
        tool_name="google_workspace",
        calendar_id="primary",
        source_text="delete WORK",
        standalone_event_ids=[],
    )
    recap = format_batch_delete_recap(draft)
    assert "2 recurring \"WORK\" series" in recap


def test_draft_round_trip_preserves_additional_series() -> None:
    draft = build_batch_delete_draft(
        [
            _work_series("w1", "series-a", "2026-06-18T08:00:00+02:00"),
            _work_series("w2", "series-b", "2026-06-18T14:00:00+02:00"),
        ],
        tool_name="google_workspace",
        calendar_id="primary",
        source_text="delete WORK",
        standalone_event_ids=[],
    )
    from services.calendar.delete_confirm import draft_to_payload

    restored = draft_from_payload(draft_to_payload(draft))
    assert len(restored.additional_series) == 1
    assert restored.additional_series[0].recurring_event_id == "series-b"
