"""Crash report payload validation."""

from __future__ import annotations

import unittest

from crash_reports.schemas import CrashReportIn


class TestCrashReportIn(unittest.TestCase):
    def test_accepts_minimal(self) -> None:
        b = CrashReportIn(
            app_version="1.0.0",
            environment="production",
            source="window_error",
            error_message="TypeError: x is not a function",
        )
        self.assertEqual(b.ui_locale, None)

    def test_accepts_enriched_optional_fields(self) -> None:
        b = CrashReportIn(
            app_version="1.0.0",
            environment="production",
            source="react_error_boundary",
            error_message="TypeError: x is not a function",
            session_id="sess-12345678",
            instance_id="inst-12345678",
            intent_bucket="messaging_whatsapp",
            tool_name="send_message",
            dedupe_key="abc123",
        )
        self.assertEqual(b.session_id, "sess-12345678")
        self.assertEqual(b.intent_bucket, "messaging_whatsapp")

    def test_rejects_long_message(self) -> None:
        with self.assertRaises(Exception):
            CrashReportIn(
                app_version="1",
                environment="dev",
                source="window_error",
                error_message="x" * 9000,
            )


if __name__ == "__main__":
    unittest.main()
