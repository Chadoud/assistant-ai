"""HTTP routes for calendar delete propose/confirm."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from routes.calendar_routes import router
from services.calendar.schemas import CalendarDeleteDraftPayload


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.delenv("ASSISTANT_CALENDAR_SERVICE", raising=False)
    monkeypatch.delenv("ASSISTANT_CALENDAR_DELETE_CONFIRM", raising=False)
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def test_propose_delete_recurring_needs_scope(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    class _Service:
        def propose_delete(self, _body: Any) -> Any:
            from services.calendar.schemas import CalendarDeleteResponse

            return CalendarDeleteResponse(
                ok=True,
                status="needs_scope",
                recap="Weekly standup — repeats every Tuesday.",
                draft=CalendarDeleteDraftPayload(
                    tool_name="google_workspace",
                    event_id="standup20260618T100000Z",
                    recurring_event_id="abc123standupmaster",
                    summary="Weekly standup",
                    start="2026-06-18T10:00:00+02:00",
                    end="2026-06-18T10:30:00+02:00",
                    is_recurring=True,
                ),
                scope_options=["this_instance", "this_and_following", "all_series"],
            )

    monkeypatch.setattr("routes.calendar_routes.get_calendar_service", lambda: _Service())
    response = client.post(
        "/integrations/calendar/events/propose-delete",
        json={"source_text": "delete weekly standup"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "needs_scope"
    assert data["draft"]["is_recurring"] is True


def test_confirm_delete_reject_cancels_without_api_call(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    delete_calls: list[Any] = []

    class _Service:
        def confirm_delete(self, body: Any) -> Any:
            from services.calendar.schemas import CalendarDeleteResponse

            if body.user_reply.strip().lower().startswith("non"):
                return CalendarDeleteResponse(ok=True, status="cancelled", recap="Cancelled.")
            delete_calls.append(body)
            return CalendarDeleteResponse(ok=True, status="deleted", deleted_count=1)

    monkeypatch.setattr("routes.calendar_routes.get_calendar_service", lambda: _Service())
    draft = {
        "tool_name": "google_workspace",
        "event_id": "evt1",
        "summary": "Budget review",
        "start": "2026-06-19T14:00:00+02:00",
        "end": "2026-06-19T15:00:00+02:00",
        "is_recurring": False,
    }
    response = client.post(
        "/integrations/calendar/events/confirm-delete",
        json={"draft": draft, "user_reply": "non merci"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"
    assert delete_calls == []


def test_confirm_delete_this_and_following(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    captured: list[str] = []

    class _Service:
        def confirm_delete(self, body: Any) -> Any:
            from services.calendar.schemas import CalendarDeleteResponse

            captured.append(str(body.scope))
            return CalendarDeleteResponse(
                ok=True,
                status="deleted",
                deleted_count=2,
                data={"deleted_count": 2, "scope": body.scope},
            )

    monkeypatch.setattr("routes.calendar_routes.get_calendar_service", lambda: _Service())
    draft = {
        "tool_name": "google_workspace",
        "event_id": "standup20260618T100000Z",
        "recurring_event_id": "abc123standupmaster",
        "summary": "Weekly standup",
        "start": "2026-06-18T10:00:00+02:00",
        "end": "2026-06-18T10:30:00+02:00",
        "is_recurring": True,
    }
    response = client.post(
        "/integrations/calendar/events/confirm-delete",
        json={"draft": draft, "scope": "this_and_following"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "deleted"
    assert captured == ["this_and_following"]
