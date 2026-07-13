"""Tests for Gmail batch move and filter operations."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from actions.google_workspace_tool import _gmail_create_filter, _gmail_move_batch


def test_move_batch_requires_ids_or_query() -> None:
    result = _gmail_move_batch({})
    assert result["ok"] is False
    assert "required" in result["error"].lower()


@patch("actions.google_workspace_tool._gmail_move")
@patch("actions.google_workspace_tool._gmail_search")
def test_move_batch_from_query(mock_search: MagicMock, mock_move: MagicMock) -> None:
    mock_search.return_value = {
        "ok": True,
        "data": {"messages": [{"id": "a"}, {"id": "b"}]},
    }
    mock_move.return_value = {"ok": True, "data": {"message_id": "a"}}
    result = _gmail_move_batch({"query": "from:chess.com", "max_results": 10})
    assert result["ok"] is True
    assert result["data"]["moved_count"] == 2
    assert mock_move.call_count == 2


@patch("actions.google_workspace_tool.httpx.post")
@patch("actions.google_workspace_tool._gmail_headers")
def test_create_filter_posts_criteria(mock_headers: MagicMock, mock_post: MagicMock) -> None:
    mock_headers.return_value = {"Authorization": "Bearer test"}
    mock_post.return_value = MagicMock(status_code=200, raise_for_status=lambda: None)
    mock_post.return_value.json.return_value = {"id": "filter123"}
    result = _gmail_create_filter({"from": "chess.com"})
    assert result["ok"] is True
    assert result["data"]["filter_id"] == "filter123"
    payload = mock_post.call_args.kwargs.get("content") or mock_post.call_args[1].get("content")
    assert "chess.com" in str(payload)


def test_create_filter_requires_criteria() -> None:
    result = _gmail_create_filter({})
    assert result["ok"] is False
