"""Calendar must use a freshly relayed google-calendar token on the next ask.

Regression: Settings/OAuth can show Calendar as connected while the backend
in-memory cache still only has a Gmail-scoped ``google`` alias. The next
``list_calendar_events`` then 403s with "connected but no calendar access".
After ``google-calendar`` is relayed, the following call must prefer that token.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import httpx
import pytest

from actions import google_workspace_tool as gw
from connector_credentials import clear_all_tokens, store_token


@pytest.fixture(autouse=True)
def _isolate_creds():
    clear_all_tokens()
    yield
    clear_all_tokens()


def _http_status_error(status: int, body: str) -> httpx.HTTPStatusError:
    request = MagicMock()
    request.url = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
    response = MagicMock()
    response.status_code = status
    response.text = body
    return httpx.HTTPStatusError("err", request=request, response=response)


def test_calendar_fails_with_gmail_only_google_alias_then_works_after_calendar_relay():
    """Simulate: Gmail connected → ask calendar (fail) → relay calendar → ask again (ok)."""
    store_token("google-gmail", "gmail-only-token", 3600)
    store_token("google", "gmail-only-token", 3600)

    scope_body = (
        '{"error":{"status":"PERMISSION_DENIED","message":'
        '"Request had insufficient authentication scopes."}}'
    )
    with patch.object(httpx, "get", side_effect=_http_status_error(403, scope_body)):
        first = gw.google_workspace({"operation": "list_calendar_events", "max_results": 5})

    assert first["ok"] is False
    assert first.get("needs_reconnect") == "google-calendar"
    assert "calendar" in first["error"].lower()

    # User connects Google Calendar; Electron relays the new grant.
    store_token("google-calendar", "calendar-token", 3600)

    ok_response = MagicMock()
    ok_response.status_code = 200
    ok_response.json.return_value = {"items": []}
    ok_response.raise_for_status = MagicMock()

    with patch.object(httpx, "get", return_value=ok_response) as get_mock:
        second = gw.google_workspace({"operation": "list_calendar_events", "max_results": 5})

    assert second["ok"] is True
    auth = get_mock.call_args.kwargs["headers"]["Authorization"]
    assert auth == "Bearer calendar-token"


def test_calendar_headers_prefer_google_calendar_over_google_alias():
    store_token("google", "generic-gmail-token", 3600)
    store_token("google-calendar", "specific-cal-token", 3600)
    headers = gw._calendar_headers()
    assert headers["Authorization"] == "Bearer specific-cal-token"
