"""HTTP-level tests for Microsoft Graph connector actions."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import httpx
import pytest

from actions import microsoft_graph_tool as ms


@pytest.fixture
def mock_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ms, "try_get_token", lambda *_ids: "test-ms-token")


@pytest.mark.usefixtures("mock_token")
def test_mail_search_returns_messages() -> None:
    response = MagicMock()
    response.status_code = 200
    response.json.return_value = {
        "value": [
            {
                "id": "m-1",
                "subject": "Quarterly report",
                "from": {"emailAddress": {"address": "team@example.com"}},
                "receivedDateTime": "2026-06-16T08:00:00Z",
                "bodyPreview": "Please review",
                "importance": "normal",
                "flag": {"flagStatus": "notFlagged"},
            }
        ]
    }
    response.raise_for_status = MagicMock()

    with patch.object(httpx, "get", return_value=response) as get_mock:
        out = ms._mail_search({"query": "report", "max_results": 10})

    assert out["ok"] is True
    assert out["data"]["count"] == 1
    assert out["data"]["messages"][0]["subject"] == "Quarterly report"
    get_mock.assert_called_once()
    assert get_mock.call_args.kwargs["headers"]["Authorization"] == "Bearer test-ms-token"


@pytest.mark.usefixtures("mock_token")
def test_mail_search_propagates_http_error() -> None:
    response = MagicMock()
    response.status_code = 403
    response.raise_for_status.side_effect = httpx.HTTPStatusError(
        "Forbidden",
        request=MagicMock(),
        response=response,
    )
    with patch.object(httpx, "get", return_value=response):
        with pytest.raises(httpx.HTTPStatusError):
            ms._mail_search({"query": "blocked"})
