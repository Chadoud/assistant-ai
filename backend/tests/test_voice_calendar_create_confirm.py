"""Tests for calendar create confirmation and title fidelity."""

from datetime import datetime
from zoneinfo import ZoneInfo

from voice.calendar_create_args import (
    infer_calendar_create_args,
    resolve_calendar_title,
    titles_diverge_on_location,
)
from voice.calendar_create_confirm import (
    CalendarConfirmActionKind,
    build_calendar_create_draft,
    draft_missing_field,
    format_calendar_recap,
    parse_calendar_confirm_response,
)
from voice.tool_dispatch import ToolDispatchState, process_pending_calendar_confirm


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


def test_process_pending_reject_clears_state():
    speech = "Créer un événement demain à midi : acheter bourbon à Turinsabe"
    draft = build_calendar_create_draft(
        "google_workspace",
        {"operation": "create_calendar_event"},
        speech,
    )
    assert draft is not None
    state = ToolDispatchState()
    state.pending_calendar_create = draft
    pending_results: list[str] = []
    handled = process_pending_calendar_confirm("non", state, pending_results)
    assert handled is True
    assert state.pending_calendar_create is None
    assert pending_results


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
