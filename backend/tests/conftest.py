"""
Shared pytest configuration for the backend test suite.

AppTokenMiddleware is a no-op when EXOSITES_APP_TOKEN is unset (dev mode).
In production the Electron main process sets the token; in tests we clear it
so every test module gets unauthenticated access to the local FastAPI app,
which is the correct baseline for route / logic tests.
"""


import pytest


@pytest.fixture(autouse=True)
def insecure_local_tests(monkeypatch: pytest.MonkeyPatch) -> None:
    """Explicit insecure mode for route tests unless a test sets EXOSITES_APP_TOKEN."""
    monkeypatch.setenv("EXOSITES_INSECURE_LOCAL", "1")
    monkeypatch.delenv("EXOSITES_APP_TOKEN", raising=False)
    monkeypatch.setenv("EXOSITES_CRASH_INGEST_DISABLED", "1")
    monkeypatch.delenv("EXOSITES_CRASH_INGEST_URL", raising=False)
    monkeypatch.delenv("EXOSITES_CRASH_INGEST_TOKEN", raising=False)
    monkeypatch.delenv("EXOSITES_CLOUD_SORT_WORKER", raising=False)
    monkeypatch.delenv("EXOSITES_CLOUD_SORT_WORKER_URL", raising=False)
    monkeypatch.delenv("EXOSITES_SORT_SERVICE_MODE", raising=False)
