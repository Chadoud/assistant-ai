"""Google Calendar list pagination for delete discovery."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from actions.google_workspace_tool import _calendar_list_events


def _event(event_id: str, summary: str) -> dict:
    return {
        "id": event_id,
        "summary": summary,
        "start": {"dateTime": "2026-06-19T15:00:00+02:00"},
        "end": {"dateTime": "2026-06-19T16:00:00+02:00"},
        "recurringEventId": "master-1",
    }


def test_list_events_paginates_until_no_next_page_token() -> None:
    page_one = MagicMock()
    page_one.raise_for_status = MagicMock()
    page_one.json.return_value = {
        "items": [_event("e1", "Snack")],
        "nextPageToken": "page-2",
    }
    page_two = MagicMock()
    page_two.raise_for_status = MagicMock()
    page_two.json.return_value = {
        "items": [_event("e2", "Snack")],
        "nextPageToken": None,
    }

    with patch("actions.google_workspace_tool.httpx.get", side_effect=[page_one, page_two]) as get:
        with patch("actions.google_workspace_tool._calendar_headers", return_value={}):
            result = _calendar_list_events(
                {
                    "operation": "list_calendar_events",
                    "fetch_all": True,
                    "max_results": 1,
                    "max_total": 10,
                    "time_min": "2026-01-01T00:00:00Z",
                    "time_max": "2027-01-01T00:00:00Z",
                    "q": "snack",
                }
            )

    assert result["ok"] is True
    assert result["data"]["count"] == 2
    assert get.call_count == 2
    second_params = get.call_args_list[1].kwargs["params"]
    assert second_params["pageToken"] == "page-2"
    assert second_params["q"] == "snack"
