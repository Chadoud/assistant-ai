"""Crash ingest must never forward pytest or verify payloads to production."""

from __future__ import annotations

import pathlib
import sys
from unittest.mock import patch

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from crash_reports.forward_guard import should_block_crash_forward
from crash_reports.schemas import CrashReportIn


@pytest.mark.parametrize(
    ("payload", "reason_prefix"),
    [
        (
            {
                "app_version": "1.0.0",
                "environment": "test",
                "source": "window_error",
                "error_message": "Test error for pytest",
            },
            "test_error",
        ),
        (
            {
                "app_version": "verify",
                "environment": "production",
                "source": "script",
                "platform": "script",
                "error_message": "Automated verify ping",
            },
            "test_",
        ),
        (
            {
                "app_version": "0.0.0-test",
                "environment": "test",
                "source": "selftest",
                "platform": "crash-ingest-selftest",
                "error_message": "connectivity self-test (safe to delete)",
            },
            "test_",
        ),
    ],
)
def test_should_block_crash_forward_for_test_markers(
    payload: dict,
    reason_prefix: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    monkeypatch.delenv("EXOSITES_CRASH_INGEST_DISABLED", raising=False)
    body = CrashReportIn(**payload)
    blocked, reason = should_block_crash_forward(body)
    assert blocked is True
    assert reason.startswith(reason_prefix)


def test_should_block_crash_forward_under_pytest(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PYTEST_CURRENT_TEST", "tests/test_crash_forward_isolation.py::test")
    monkeypatch.delenv("EXOSITES_CRASH_INGEST_DISABLED", raising=False)
    body = CrashReportIn(
        app_version="1.1.32",
        environment="production",
        source="react_error_boundary",
        error_message="real user crash",
    )
    blocked, reason = should_block_crash_forward(body)
    assert blocked is True
    assert reason == "pytest"


def test_forward_crash_report_skips_when_blocked(monkeypatch: pytest.MonkeyPatch) -> None:
    import asyncio

    from crash_reports.config import CrashIngestConfig
    from crash_reports.repository import forward_crash_report

    monkeypatch.setenv("PYTEST_CURRENT_TEST", "tests/test_crash_forward_isolation.py::sync")
    body = CrashReportIn(
        app_version="1.1.32",
        environment="production",
        source="window_error",
        error_message="Should not leave pytest",
    )
    conf = CrashIngestConfig(
        url="https://example.test/v1/crash-reports",
        token="secret",
        verify_ssl=True,
        timeout_seconds=5,
    )

    with patch("crash_reports.repository.httpx.AsyncClient") as client_cls:
        asyncio.run(forward_crash_report(conf, body))
        client_cls.assert_not_called()
