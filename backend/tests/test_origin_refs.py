"""Tests for origin ref parsing and URL builders."""

from __future__ import annotations

from origin_refs import (
    ORIGIN_GMAIL_MESSAGE,
    ORIGIN_GOOGLE_CALENDAR_EVENT,
    build_google_calendar_event_url,
    build_url_from_external_ref,
    is_valid_google_calendar_open_url,
    origin_from_task,
    parse_external_id,
)

_SAMPLE_EVENT_ID = "47532c77545843fbb3ba6f43735e8f20260616T110000Z"
_VALID_CALENDAR_URL = build_google_calendar_event_url(_SAMPLE_EVENT_ID)


def test_parse_gmail_external_id() -> None:
    parsed = parse_external_id("gmail:mail:abc123")
    assert parsed is not None
    assert parsed.source == "gmail"
    assert parsed.kind == "mail"
    assert parsed.item_id == "abc123"


def test_parse_google_calendar_external_id() -> None:
    parsed = parse_external_id("google-calendar:cal:event-42")
    assert parsed is not None
    assert parsed.source == "google-calendar"


def test_build_gmail_open_url() -> None:
    url = build_url_from_external_ref("gmail:mail:abc123")
    assert url is not None
    assert "mail.google.com" in url
    assert "abc123" in url


def test_build_google_calendar_open_url_prefers_valid_cached() -> None:
    url = build_url_from_external_ref(
        f"google-calendar:cal:{_SAMPLE_EVENT_ID}",
        cached_url=_VALID_CALENDAR_URL,
    )
    assert url == _VALID_CALENDAR_URL


def test_build_google_calendar_open_url_rejects_corrupt_cached() -> None:
    corrupt = (
        "https://calendar.google.com/calendar/u/0/r?eid="
        "NDc1MzJjNzc1NDU4NDNmYmIzYmE2ZjQzNzM1ZThmMjAyNjA2MTZThmMjAyNjA2MTZUMTEwMDAwWiBwcmItYXJ5"
    )
    url = build_url_from_external_ref(
        f"google-calendar:cal:{_SAMPLE_EVENT_ID}",
        cached_url=corrupt,
    )
    assert url == _VALID_CALENDAR_URL


def test_is_valid_google_calendar_open_url() -> None:
    assert is_valid_google_calendar_open_url(
        _VALID_CALENDAR_URL,
        expected_event_id=_SAMPLE_EVENT_ID,
    )
    corrupt = (
        "https://calendar.google.com/calendar/u/0/r?eid="
        "NDc1MzJjNzc1NDU4NDNmYmIzYmE2ZjQzNzM1ZThmMjAyNjA2MTZThmMjAyNjA2MTZUMTEwMDAwWiBwcmItYXJ5"
    )
    assert not is_valid_google_calendar_open_url(
        corrupt,
        expected_event_id=_SAMPLE_EVENT_ID,
    )


def test_origin_from_calendar_task() -> None:
    task = {
        "id": 7,
        "description": "Prepare for: Team standup",
        "external_id": "google-calendar:cal:evt1",
        "source_url": _VALID_CALENDAR_URL,
    }
    fields = origin_from_task(task)
    assert fields["origin_kind"] == ORIGIN_GOOGLE_CALENDAR_EVENT
    assert fields["origin_ref"] == "google-calendar:cal:evt1"
    assert fields["linked_task_id"] == 7
    assert fields["origin_label"] == "Team standup"


def test_origin_from_gmail_task() -> None:
    task = {
        "id": 2,
        "description": "Invoice due Friday",
        "external_id": "gmail:mail:msg99",
        "source_url": None,
    }
    fields = origin_from_task(task)
    assert fields["origin_kind"] == ORIGIN_GMAIL_MESSAGE
    assert "mail.google.com" in (fields.get("origin_url") or "")
