"""Tests for optional VPS sort queue health probe."""

from __future__ import annotations

import pathlib
import sys
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from llm.sort_queue_health import check_sort_queue_health  # noqa: E402


def test_sort_queue_disabled_when_no_url(monkeypatch):
    monkeypatch.delenv("EXOSITES_SORT_QUEUE_URL", raising=False)
    monkeypatch.delenv("EXOSITES_USER_DATA", raising=False)
    out = check_sort_queue_health()
    assert out["ok"] is True
    assert out["detail"] == "disabled"
    assert out["enabled"] is False


def test_sort_queue_reachable(monkeypatch):
    monkeypatch.setenv("EXOSITES_SORT_QUEUE_URL", "https://llm.example.test")
    response = MagicMock()
    response.status_code = 200
    response.content = b'{"ok":true,"pending_jobs":2,"overloaded":false}'
    response.json.return_value = {"ok": True, "pending_jobs": 2, "overloaded": False}

    client = MagicMock()
    client.__enter__.return_value = client
    client.get.return_value = response

    with patch("httpx.Client", return_value=client):
        out = check_sort_queue_health()

    client.get.assert_called_once()
    assert "/v1/sort/queue/health" in client.get.call_args[0][0]
    assert out["enabled"] is True
    assert out["pending_jobs"] == 2


def test_sort_queue_overloaded_is_degraded(monkeypatch):
    monkeypatch.setenv("EXOSITES_SORT_QUEUE_URL", "https://llm.example.test")
    response = MagicMock()
    response.status_code = 200
    response.content = b'{"ok":true,"overloaded":true,"pending_jobs":64}'
    response.json.return_value = {"ok": True, "overloaded": True, "pending_jobs": 64}

    client = MagicMock()
    client.__enter__.return_value = client
    client.get.return_value = response

    with patch("httpx.Client", return_value=client):
        out = check_sort_queue_health()

    assert out["ok"] is False
    assert out["detail"] == "overloaded"
