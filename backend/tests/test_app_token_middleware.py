"""
Regression tests: AppTokenMiddleware enforces X-App-Token on protected routes
when EXOSITES_APP_TOKEN is set, and passes requests correctly when the header is present.

Endpoints under test:
  POST /v1/telemetry/events
  POST /v1/crash-reports
"""

from __future__ import annotations

import json
import pathlib
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

TOKEN = "test-secret-token-abc123"

VALID_TELEMETRY_BATCH = {
    "instance_id": "test-instance-01",
    "app_version": "1.0.0",
    "platform": "test",
    "locale": "en",
    "events": [],
}

VALID_CRASH_REPORT = {
    "app_version": "1.0.0",
    "environment": "test",
    "source": "window_error",
    "error_message": "Test error for pytest",
}


@pytest.fixture()
def client_with_token(monkeypatch):
    """
    Re-use the already-built global app singleton — avoids a second jobs.json
    write that fails on Windows when the app is running.
    The middleware reads EXOSITES_APP_TOKEN on each request, so patching the
    env before sending requests is sufficient.
    """
    monkeypatch.setenv("EXOSITES_APP_TOKEN", TOKEN)
    monkeypatch.delenv("EXOSITES_INSECURE_LOCAL", raising=False)
    from main import app

    return TestClient(app, raise_server_exceptions=False)


def auth_headers() -> dict[str, str]:
    return {"X-App-Token": TOKEN, "Content-Type": "application/json"}


# ---------------------------------------------------------------------------
# /v1/telemetry/events
# ---------------------------------------------------------------------------


class TestTelemetryEventsAuth:
    def test_without_token_returns_401(self, client_with_token):
        r = client_with_token.post(
            "/v1/telemetry/events",
            content=json.dumps(VALID_TELEMETRY_BATCH),
            headers={"Content-Type": "application/json"},
        )
        assert r.status_code == 401, r.text

    def test_with_wrong_token_returns_401(self, client_with_token):
        r = client_with_token.post(
            "/v1/telemetry/events",
            content=json.dumps(VALID_TELEMETRY_BATCH),
            headers={"X-App-Token": "wrong-token", "Content-Type": "application/json"},
        )
        assert r.status_code == 401, r.text

    def test_with_correct_token_passes_middleware(self, client_with_token):
        """Middleware should pass the request; route may return 200 or validation error."""
        r = client_with_token.post(
            "/v1/telemetry/events",
            content=json.dumps(VALID_TELEMETRY_BATCH),
            headers=auth_headers(),
        )
        assert r.status_code != 401, f"Expected non-401, got {r.status_code}: {r.text}"


# ---------------------------------------------------------------------------
# /v1/crash-reports
# ---------------------------------------------------------------------------


class TestCrashReportsAuth:
    def test_without_token_returns_401(self, client_with_token):
        r = client_with_token.post(
            "/v1/crash-reports",
            content=json.dumps(VALID_CRASH_REPORT),
            headers={"Content-Type": "application/json"},
        )
        assert r.status_code == 401, r.text

    def test_with_wrong_token_returns_401(self, client_with_token):
        r = client_with_token.post(
            "/v1/crash-reports",
            content=json.dumps(VALID_CRASH_REPORT),
            headers={"X-App-Token": "not-the-right-token", "Content-Type": "application/json"},
        )
        assert r.status_code == 401, r.text

    def test_with_correct_token_passes_middleware(self, client_with_token):
        """Middleware passes; route may 503 (MySQL not configured) but must not 401."""
        r = client_with_token.post(
            "/v1/crash-reports",
            content=json.dumps(VALID_CRASH_REPORT),
            headers=auth_headers(),
        )
        assert r.status_code != 401, f"Expected non-401, got {r.status_code}: {r.text}"


# ---------------------------------------------------------------------------
# Exempt paths still work without a token
# ---------------------------------------------------------------------------


class TestExemptPaths:
    def test_health_no_token(self, monkeypatch, client_with_token):
        """Health endpoint must respond 200 even without the app token header."""
        # Use a client without the X-App-Token header
        r = client_with_token.get("/health")
        assert r.status_code == 200

    def test_public_client_config_no_token(self, monkeypatch, client_with_token):
        """/v1/public/* is exempt — must respond without X-App-Token header."""
        r = client_with_token.get("/v1/public/client-config")
        assert r.status_code == 200
