"""Tests for voice calendar-create argument inference."""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from voice.calendar_create_args import (
    extract_event_start_from_voice_text,
    extract_event_title_from_voice_text,
    infer_calendar_create_args,
)
from voice.tool_args import enrich_voice_tool_args


def test_extract_title_after_colon():
    title = extract_event_title_from_voice_text(
        "Crée un événement demain à midi : acheter bourbon à Turinsev"
    )
    assert title == "Acheter bourbon à Turinsev"


def test_extract_title_from_paddle_request():
    title = extract_event_title_from_voice_text(
        "pour que j'aille faire du paddle avec Alexandre à 15h."
    )
    assert title == "Faire du paddle avec Alexandre"


def test_extract_start_at_french_hour():
    start = extract_event_start_from_voice_text(
        "pour que j'aille faire du paddle avec Alexandre à 15h.",
        now=datetime(2026, 6, 17, 10, 0, tzinfo=ZoneInfo("Europe/Paris")),
    )
    assert start is not None
    assert start.hour == 15
    assert start.minute == 0
    assert start.day == 17


def test_extract_start_demain_midi():
    start = extract_event_start_from_voice_text(
        "Crée un événement demain à midi : acheter bourbon",
        now=datetime(2026, 6, 17, 10, 0, tzinfo=ZoneInfo("Europe/Paris")),
    )
    assert start is not None
    assert start.day == 18
    assert start.hour == 12
    assert start.minute == 0


def test_infer_google_workspace_create_fills_missing_fields():
    speech = "pour que j'aille faire du paddle avec Alexandre à 15h."
    enriched = enrich_voice_tool_args(
        "google_workspace",
        {"operation": "create_calendar_event"},
        speech,
    )
    assert enriched["summary"] == "Faire du paddle avec Alexandre"
    assert enriched["start"]
    assert enriched["end"]
    assert enriched["start"] != enriched["end"]


def test_infer_keeps_explicit_model_args():
    enriched = infer_calendar_create_args(
        {
            "operation": "create_calendar_event",
            "summary": "Team sync",
            "start": "2026-06-18T15:00:00+02:00",
            "end": "2026-06-18T16:00:00+02:00",
        },
        "anything",
        title_field="summary",
    )
    assert enriched["summary"] == "Team sync"
    assert enriched["start"] == "2026-06-18T15:00:00+02:00"
