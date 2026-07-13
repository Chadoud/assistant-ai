"""Regression: GET /gmail/status must not raise (redirect_uri ordering)."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from routes.gmail_routes import create_gmail_router


def test_gmail_status_returns_json_without_error():
    app = FastAPI()
    app.include_router(create_gmail_router())
    client = TestClient(app)
    response = client.get("/gmail/status")
    assert response.status_code == 200
    data = response.json()
    assert "oauth_configured" in data
    assert "oauth_flow_active" in data
    assert data["oauth_flow_active"] is False
    assert "oauth_flow_error" in data
    assert "gmail_oauth_redirect_uri" in data
    assert isinstance(data.get("developer_setup_steps"), list)
    assert len(data["developer_setup_steps"]) == 5
    assert isinstance(data.get("gmail_import_max_messages"), int)
    assert data["gmail_import_max_messages"] >= 1
