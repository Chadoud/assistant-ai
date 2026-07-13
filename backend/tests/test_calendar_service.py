"""Tests for unified CalendarService (ported from voice calendar confirm tests)."""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from services.calendar import (
    CalendarConfirmActionKind,
    CalendarCreateDraft,
    CalendarService,
    build_calendar_create_draft,
    calendar_service_enabled,
    draft_missing_field,
    format_calendar_recap,
    infer_calendar_create_args,
    parse_calendar_confirm_response,
    parse_simple_confirm_reply,
    resolve_calendar_title,
    titles_diverge_on_location,
)
from services.calendar.schemas import BulkDeleteCalendarEventsRequest, ProposeCalendarEventRequest
from voice.tool_dispatch import ToolDispatchState, _resolve_calendar_create_tool_result


def test_turinsabe_not_replaced_by_tournai():
    speech = "Créer un événement pour demain pour que j'aille acheter du bourbon à Turinsabe."
    model = "Acheter du bourbon à Tournai-sur-Dive"
    title, source, overridden = resolve_calendar_title(speech, model)
    assert overridden is True
    assert source == "stt"
    assert "Turinsabe" in title or "turinsabe" in title.lower()
    assert titles_diverge_on_location(
        "Acheter du bourbon à Turinsabe",
        "Acheter du bourbon à Tournai-sur-Dive",
    )


def test_infer_overrides_model_location_from_stt():
    speech = "Créer un événement pour demain à midi : acheter bourbon à Turinsabe"
    enriched = infer_calendar_create_args(
        {
            "operation": "create_calendar_event",
            "summary": "Acheter du bourbon à Tournai-sur-Dive",
            "start": "2026-06-19T12:00:00+02:00",
            "end": "2026-06-19T13:00:00+02:00",
        },
        speech,
        title_field="summary",
    )
    assert "Turinsabe" in enriched["summary"] or "turinsabe" in enriched["summary"].lower()


def test_draft_requires_time_when_missing():
    speech = "Créer un événement pour demain pour que j'aille acheter du bourbon à Turinsabe."
    draft = build_calendar_create_draft(
        "google_workspace",
        {"operation": "create_calendar_event"},
        speech,
    )
    assert draft is not None
    assert draft_missing_field(draft) == "time"


def test_draft_recap_when_time_present():
    speech = "Créer un événement demain à midi : acheter bourbon à Turinsabe"
    draft = build_calendar_create_draft(
        "google_workspace",
        {"operation": "create_calendar_event"},
        speech,
    )
    assert draft is not None
    assert draft_missing_field(draft) is None
    recap = format_calendar_recap(
        draft,
        now=datetime(2026, 6, 17, 10, 0, tzinfo=ZoneInfo("Europe/Paris")),
    )
    assert "midi" in recap or "12:00" in recap
    assert "Turinsabe" in recap or "turinsabe" in recap.lower()
    assert "Je crée" in recap


def test_parse_confirm_oui():
    speech = "Créer un événement demain à midi : acheter bourbon à Turinsabe"
    draft = build_calendar_create_draft(
        "google_workspace",
        {"operation": "create_calendar_event"},
        speech,
    )
    assert draft is not None
    action = parse_calendar_confirm_response("oui c'est bon", draft)
    assert action.kind == CalendarConfirmActionKind.CONFIRM


def test_parse_reject_non():
    speech = "Créer un événement demain à midi : acheter bourbon à Turinsabe"
    draft = build_calendar_create_draft(
        "google_workspace",
        {"operation": "create_calendar_event"},
        speech,
    )
    assert draft is not None
    action = parse_calendar_confirm_response("non annule", draft)
    assert action.kind == CalendarConfirmActionKind.REJECT


def test_repeat_of_source_utterance_is_not_patch():
    speech = (
        "Créer un événement pour demain pour que j'aille au bord du lac "
        "avec Alexandre à 15h."
    )
    draft = build_calendar_create_draft(
        "google_workspace",
        {"operation": "create_calendar_event"},
        speech,
    )
    assert draft is not None
    action = parse_calendar_confirm_response(speech, draft)
    assert action.kind == CalendarConfirmActionKind.NONE


def test_time_suffix_not_patched_as_location():
    speech = "Créer un événement demain à midi : acheter bourbon à Turinsabe"
    draft = build_calendar_create_draft(
        "google_workspace",
        {"operation": "create_calendar_event"},
        speech,
    )
    assert draft is not None
    action = parse_calendar_confirm_response("à 15h", draft)
    assert action.kind == CalendarConfirmActionKind.PATCH
    assert "summary" not in (action.patch or {})


def _lake_draft() -> CalendarCreateDraft:
    return CalendarCreateDraft(
        tool_name="google_workspace",
        args={
            "operation": "create_calendar_event",
            "summary": "Go by the lake",
            "start": "2026-06-18T15:00:00+02:00",
            "end": "2026-06-18T16:00:00+02:00",
        },
        source_text="went for tomorrow so I don't forget to go by the lake at 3 pm.",
        summary="Go by the lake",
        start="2026-06-18T15:00:00+02:00",
        end="2026-06-18T16:00:00+02:00",
        title_field="summary",
    )


def test_service_duplicate_tool_call_returns_same_recap():
    state = ToolDispatchState()
    state.pending_calendar_create = _lake_draft()
    result = _resolve_calendar_create_tool_result(
        "google_workspace",
        {"operation": "create_calendar_event"},
        "went for tomorrow so I don't forget to go by the lake at 3 pm.",
        state,
    )
    assert result["data"]["status"] == "needs_confirmation"
    assert result["ok"] is True
    assert state.pending_calendar_create is not None
    assert "Go by the lake" in result["data"]["recap"]


def test_needs_confirmation_is_ok_for_promise_guard():
    from services.calendar import needs_confirmation_tool_result, tool_result_blocks_promise_nudge

    result = needs_confirmation_tool_result(_lake_draft())
    assert result["ok"] is True
    assert tool_result_blocks_promise_nudge(result) is True


def test_service_propose_needs_confirmation():
    service = CalendarService()
    response = service.propose(
        ProposeCalendarEventRequest(
            source_text="Créer un événement demain à midi : acheter bourbon à Turinsabe",
            tool_name="google_workspace",
        )
    )
    assert response.status == "needs_confirmation"
    assert response.recap
    assert response.draft is not None


def test_bulk_delete_calls_google_workspace(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict] = []

    def _fake_dispatch(tool_name, params, *, approval_granted=False):
        calls.append({"tool": tool_name, "params": params, "approval": approval_granted})
        return {"ok": True, "data": {"deleted_event_id": params["event_id"]}}

    monkeypatch.setattr("tool_registry.dispatch_sync", _fake_dispatch)

    service = CalendarService()
    result = service.bulk_delete(
        BulkDeleteCalendarEventsRequest(event_ids=["evt-1", "evt-2"])
    )
    assert result["ok"] is True
    assert result["data"]["deleted_count"] == 2
    assert len(calls) == 2
    assert all(c["params"]["operation"] == "delete_calendar_event" for c in calls)


def test_parse_simple_confirm_reply() -> None:
    assert parse_simple_confirm_reply("yes please") == "confirm"
    assert parse_simple_confirm_reply("non") == "reject"


def test_calendar_service_raises_when_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ASSISTANT_CALENDAR_SERVICE", "0")
    assert calendar_service_enabled() is False
    service = CalendarService()
    with pytest.raises(RuntimeError, match="assistant_calendar_service_disabled"):
        service.propose(
            ProposeCalendarEventRequest(
                source_text="meeting tomorrow 9am",
                tool_name="google_workspace",
            )
        )
