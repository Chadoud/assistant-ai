"""HTTP-level tests for Google Workspace connector actions."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import httpx
import pytest

from actions import google_workspace_tool as gw


@pytest.fixture
def mock_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(gw, "try_get_token", lambda *_ids: "test-google-token")


@pytest.mark.usefixtures("mock_token")
def test_gmail_search_returns_messages() -> None:
    list_response = MagicMock()
    list_response.status_code = 200
    list_response.json.return_value = {"messages": [{"id": "msg-1"}]}
    list_response.raise_for_status = MagicMock()

    detail_response = MagicMock()
    detail_response.status_code = 200
    detail_response.json.return_value = {
        "id": "msg-1",
        "snippet": "Hello",
        "labelIds": ["INBOX"],
        "payload": {
            "headers": [
                {"name": "Subject", "value": "Invoice"},
                {"name": "From", "value": "billing@example.com"},
                {"name": "Date", "value": "Mon, 1 Jan 2024 00:00:00 +0000"},
            ]
        },
    }

    with patch.object(httpx, "get", side_effect=[list_response, detail_response]) as get_mock:
        out = gw._gmail_search({"query": "invoice", "max_results": 5})

    assert out["ok"] is True
    assert out["data"]["count"] == 1
    assert out["data"]["messages"][0]["subject"] == "Invoice"
    assert get_mock.call_count == 2
    auth_header = get_mock.call_args_list[0].kwargs["headers"]["Authorization"]
    assert auth_header == "Bearer test-google-token"


@pytest.mark.usefixtures("mock_token")
def test_gmail_search_propagates_http_error() -> None:
    response = MagicMock()
    response.status_code = 401
    response.raise_for_status.side_effect = httpx.HTTPStatusError(
        "Unauthorized",
        request=MagicMock(),
        response=response,
    )
    with patch.object(httpx, "get", return_value=response):
        with pytest.raises(httpx.HTTPStatusError):
            gw._gmail_search({"query": "test"})
