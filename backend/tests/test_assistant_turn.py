"""Tests for POST /assistant/turn routing."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from routes.assistant_routes import create_assistant_router
from services.assistant.intent import classify_intent
from services.assistant.turn import handle_assistant_turn, unified_turn_enabled
from services.calendar import calendar_service_enabled, parse_simple_confirm_reply
from services.calendar.schemas import CalendarDeleteDraftPayload, CalendarDeleteResponse
from services.turn import turn_service_enabled


def test_classify_calendar_delete() -> None:
    assert classify_intent("delete all WORK calendar events") == "write_calendar_delete"


def test_classify_calendar_create() -> None:
    assert classify_intent("schedule a meeting with Sam tomorrow") == "write_calendar"


def test_unified_turn_calendar_propose() -> None:
    result = handle_assistant_turn(
        message="schedule paddle with Alex tomorrow at noon",
        assistant_tools_enabled=True,
    )
    assert result.mode == "complete"
    assert result.intent == "write_calendar"
    assert result.calendar_event_draft is not None or result.assistant_content


def test_unified_turn_codegen_action() -> None:
    result = handle_assistant_turn(message="build a react todo app with typescript")
    assert result.mode == "action"
    assert result.action == "codegen_studio"


def test_unified_turn_agent_action() -> None:
    result = handle_assistant_turn(
        message="plan step by step: research the venue then arrange travel",
        assistant_tools_enabled=True,
        assistant_agent_enabled=True,
    )
    assert result.mode == "action"
    assert result.action == "agent_task"


def test_unified_turn_generic_streams() -> None:
    result = handle_assistant_turn(
        message="how are you?",
        messages_for_stream=[{"role": "user", "content": "how are you?"}],
    )
    assert result.mode == "stream"


def test_unified_turn_calendar_delete_intent() -> None:
    intent = classify_intent("delete all WORK events from my calendar")
    assert intent == "write_calendar_delete"


def test_unified_turn_disabled_flag(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ASSISTANT_UNIFIED_TURN", "0")
    assert unified_turn_enabled() is False


def test_assistant_turn_route_returns_json_for_codegen() -> None:
    app = FastAPI()
    app.include_router(create_assistant_router())
    client = TestClient(app)
    response = client.post(
        "/assistant/turn",
        json={"message": "build a react todo app with typescript"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data.get("mode") == "action"
    assert data.get("action") == "codegen_studio"


def test_assistant_turn_route_404_when_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ASSISTANT_UNIFIED_TURN", "0")
    app = FastAPI()
    app.include_router(create_assistant_router())
    client = TestClient(app)
    response = client.post("/assistant/turn", json={"message": "hello"})
    assert response.status_code == 404
    assert response.json().get("detail") == "assistant_unified_turn_disabled"


def test_calendar_service_disabled_flag(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ASSISTANT_CALENDAR_SERVICE", "0")
    assert calendar_service_enabled() is False


def test_turn_service_disabled_flag(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ASSISTANT_TURN_SERVICE", "0")
    assert turn_service_enabled() is False


def test_unified_turn_calendar_writes_stream_when_service_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ASSISTANT_CALENDAR_SERVICE", "0")
    result = handle_assistant_turn(
        message="schedule paddle with Alex tomorrow at noon",
        assistant_tools_enabled=True,
        messages_for_stream=[
            {"role": "user", "content": "schedule paddle with Alex tomorrow at noon"},
        ],
    )
    assert result.mode == "stream"
    assert result.intent == "write_calendar"


def test_parse_simple_confirm_reply_shared_with_text_turn() -> None:
    assert parse_simple_confirm_reply("oui") == "confirm"
    assert parse_simple_confirm_reply("non annule") == "reject"
    assert parse_simple_confirm_reply("maybe later") == "none"


def test_assistant_turn_recurring_delete_propose(monkeypatch: pytest.MonkeyPatch) -> None:
    draft = CalendarDeleteDraftPayload(
        tool_name="google_workspace",
        event_id="standup20260618T100000Z",
        recurring_event_id="abc123standupmaster",
        summary="Weekly standup",
        start="2026-06-18T10:00:00+02:00",
        end="2026-06-18T10:30:00+02:00",
        is_recurring=True,
        recurrence_label="every Tuesday",
        source_text="delete weekly standup",
    )

    class _FakeService:
        def propose_delete(self, _body: Any) -> CalendarDeleteResponse:
            return CalendarDeleteResponse(
                ok=True,
                status="needs_scope",
                recap="Weekly standup — repeats every Tuesday. Delete only this occurrence?",
                draft=draft,
                scope_options=["this_instance", "this_and_following", "all_series"],
            )

    monkeypatch.setattr("services.assistant.turn.get_calendar_service", lambda: _FakeService())
    result = handle_assistant_turn(message="delete weekly standup")
    assert result.mode == "complete"
    assert result.intent == "write_calendar_delete"
    assert result.calendar_delete_draft is not None
    assert result.calendar_delete_draft.get("needsScope") is True
