"""Tests for local privacy wipe and activity title sanitization."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from starlette.testclient import TestClient

import main
from activity_store import _sanitize_activity_title


@pytest.fixture
def client() -> TestClient:
    return TestClient(main.app)


def test_sanitize_activity_title_redacts_email_and_truncates() -> None:
    long_title = "invoice from user@example.com " + ("x" * 100)
    out = _sanitize_activity_title(long_title)
    assert "[email]" in out
    assert "user@example.com" not in out
    assert len(out) <= 80


def test_wipe_local_requires_confirmation(client: TestClient) -> None:
    res = client.post("/v1/privacy/wipe-local", json={"confirmed": False})
    assert res.status_code == 200
    assert res.json()["ok"] is False


def test_wipe_local_calls_service(client: TestClient) -> None:
    with patch(
        "routes.privacy_routes.wipe_local_user_data",
        return_value={"ok": True, "cleared": ["memory"]},
    ) as mock_wipe:
        res = client.post("/v1/privacy/wipe-local", json={"confirmed": True})
    assert res.status_code == 200
    assert res.json()["ok"] is True
    mock_wipe.assert_called_once()
