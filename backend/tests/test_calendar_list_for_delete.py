"""Tests for paginated delete discovery and needle matching fixes."""

from __future__ import annotations

import pytest

from services.calendar.delete_needle import (
    extract_calendar_delete_needle,
    match_calendar_events_for_delete,
)
from services.calendar.list_for_delete import build_delete_list_params
from services.calendar.service import CalendarService


def test_extract_needle_strips_de_prefix() -> None:
    needle = extract_calendar_delete_needle("de snack events my calendar")
    assert needle == "snack"


def test_match_snack_events_with_de_needle() -> None:
    events = [
        {"id": "a", "summary": "Snack", "start": "2026-06-19T15:00:00+02:00"},
        {"id": "b", "summary": "WORK", "start": "2026-06-19T08:00:00+02:00"},
    ]
    matched = match_calendar_events_for_delete(events, "de snack")
    assert matched == ["a"]


def test_match_snacks_plural_needle() -> None:
    events = [{"id": "a", "summary": "Snack", "start": "2026-06-19T15:00:00+02:00"}]
    assert match_calendar_events_for_delete(events, "snacks") == ["a"]


def test_build_delete_list_params_includes_q_and_wide_window() -> None:
    params = build_delete_list_params(needle="snack")
    assert params["q"] == "snack"
    assert params["fetch_all"] is True
    assert "time_min" in params
    assert "time_max" in params
    assert params["max_total"] == 500


def test_fetch_events_for_delete_uses_paginated_list(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict] = []

    def fake_dispatch(tool_name: str, args: dict, *, approval_granted: bool) -> dict:
        calls.append(args)
        return {
            "ok": True,
            "data": {
                "events": [
                    {
                        "id": "e1",
                        "summary": "Snack",
                        "recurring_event_id": "master-1",
                        "start": "2026-06-19T15:00:00+02:00",
                    }
                ]
            },
        }

    monkeypatch.setattr("tool_registry.dispatch_sync", fake_dispatch)
    events = CalendarService().fetch_events_for_delete("google_workspace", needle="snack")
    assert len(events) == 1
    assert calls[0]["fetch_all"] is True
    assert calls[0]["q"] == "snack"
