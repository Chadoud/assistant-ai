"""Tests for GET /ready readiness checks."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from starlette.testclient import TestClient

import main


@pytest.fixture
def client() -> TestClient:
    return TestClient(main.app)


def test_health_stays_shallow(client: TestClient) -> None:
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_ready_ok_when_all_checks_pass(client: TestClient) -> None:
    checks = {
        "status": "ok",
        "checks": {
            "ollama": {"ok": True, "detail": "reachable"},
            "sqlite": {"ok": True, "detail": "stores_not_created_yet"},
            "disk": {"ok": True, "detail": "ok"},
        },
    }
    with patch("routes.meta_routes.run_readiness_checks", return_value=checks):
        res = client.get("/ready")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_ready_degraded_returns_503(client: TestClient) -> None:
    checks = {
        "status": "degraded",
        "checks": {
            "ollama": {"ok": False, "detail": "ConnectError"},
            "sqlite": {"ok": True, "detail": "readable"},
            "disk": {"ok": True, "detail": "ok"},
        },
    }
    with patch("routes.meta_routes.run_readiness_checks", return_value=checks):
        res = client.get("/ready")
    assert res.status_code == 503
    assert res.json()["status"] == "degraded"
