"""Tests for provider URL refresh on open targets."""

from __future__ import annotations

from unittest.mock import patch

from origin_refs import build_google_calendar_event_url
from origin_url_refresh import refresh_origin_url


def test_refresh_google_calendar_rejects_corrupt_cached_url() -> None:
    event_id = "47532c77545843fbb3ba6f43735e8f20260616T110000Z"
    corrupt = (
        "https://calendar.google.com/calendar/u/0/r?eid="
        "NDc1MzJjNzc1NDU4NDNmYmIzYmE2ZjQzNzM1ZThmMjAyNjA2MTZThmMjAyNjA2MTZUMTEwMDAwWiBwcmItYXJ5"
    )
    fresh = build_google_calendar_event_url(event_id)

    with patch(
        "actions.google_workspace_tool._calendar_fetch_event_html_link",
        return_value=fresh,
    ):
        url = refresh_origin_url(
            f"google-calendar:cal:{event_id}",
            cached_url=corrupt,
        )

    assert url == fresh


def test_refresh_google_calendar_falls_back_to_encoded_link() -> None:
    event_id = "47532c77545843fbb3ba6f43735e8f20260616T110000Z"

    with patch(
        "actions.google_workspace_tool._calendar_fetch_event_html_link",
        return_value=None,
    ):
        url = refresh_origin_url(f"google-calendar:cal:{event_id}", cached_url=None)

    assert url is not None
    assert "google.com/calendar/event?eid=" in url
    assert event_id in url or "NDc1MzJj" in url
