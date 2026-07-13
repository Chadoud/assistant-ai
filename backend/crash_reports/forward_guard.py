"""Block crash forward for pytest, verify scripts, and known test payloads."""

from __future__ import annotations

import os

from .schemas import CrashReportIn

_TEST_APP_VERSIONS = frozenset({"verify", "0.0.0-test"})
_TEST_SOURCES = frozenset({"script", "selftest"})
_TEST_PLATFORMS = frozenset({"script", "crash-ingest-selftest", "test"})
_TEST_ERROR_MARKERS = (
    "test error for pytest",
    "connectivity self-test",
    "automated verify",
    "enriched verify ping",
    "[archived_test]",
)


def should_block_crash_forward(body: CrashReportIn) -> tuple[bool, str]:
    """
    Return (True, reason) when a crash report must not leave this process.

    Keeps pytest and ingest smoke tests out of production analytics while still
    allowing the local route to accept payloads for middleware tests.
    """
    if os.environ.get("EXOSITES_CRASH_INGEST_DISABLED") == "1":
        return True, "ingest_disabled"
    if os.environ.get("PYTEST_CURRENT_TEST"):
        return True, "pytest"
    if body.app_version in _TEST_APP_VERSIONS:
        return True, "test_app_version"
    if body.source in _TEST_SOURCES:
        return True, "test_source"
    if body.platform in _TEST_PLATFORMS:
        return True, "test_platform"
    instance_id = (body.instance_id or "").strip()
    if instance_id.startswith("verify-"):
        return True, "verify_instance"
    message = (body.error_message or "").lower()
    for marker in _TEST_ERROR_MARKERS:
        if marker in message:
            return True, "test_error_message"
    if body.source and body.source.endswith("_archived_test"):
        return True, "archived_test"
    return False, ""
