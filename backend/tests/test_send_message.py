"""Unit tests for send_message: desktop automation primary, URL/clipboard fallbacks."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from actions.send_message import (  # noqa: E402
    build_mailto_url,
    build_telegram_url,
    build_url_for_platform,
    build_whatsapp_url,
    copy_text_to_clipboard,
    open_url_cross_platform,
    send_message,
)

# ── URL builder tests ─────────────────────────────────────────────────────────

class TestBuildUrls(unittest.TestCase):
    def test_whatsapp_url_shape(self) -> None:
        url, err = build_whatsapp_url("+41 79 123 45 67", "Hello world")
        self.assertIsNone(err)
        assert url is not None
        self.assertTrue(url.startswith("https://wa.me/41791234567"))
        self.assertIn("Hello%20world", url)

    def test_whatsapp_rejects_empty_phone(self) -> None:
        url, err = build_whatsapp_url("", "Hi")
        self.assertIsNone(url)
        self.assertIsNotNone(err)

    def test_telegram_tg_protocol(self) -> None:
        url, err = build_telegram_url("@someuser", "Hi there")
        self.assertIsNone(err)
        assert url is not None
        self.assertTrue(url.startswith("tg://msg?to="))
        self.assertIn("Hi%20there", url)

    def test_mailto_contains_address_and_body(self) -> None:
        url, err = build_mailto_url("a@b.com", "Line1", subject="Subj")
        self.assertIsNone(err)
        assert url is not None
        self.assertTrue(url.startswith("mailto:"))
        self.assertIn("a@b.com", url)
        self.assertIn("body=", url)

    def test_build_url_for_platform_dispatch(self) -> None:
        u, e = build_url_for_platform("whatsapp", "15551234567", "x")
        self.assertIsNone(e)
        assert u and "wa.me" in u
        u2, e2 = build_url_for_platform("bogus", "", "")
        self.assertIsNone(u2)
        self.assertIsNotNone(e2)


# ── send_message routing tests ────────────────────────────────────────────────

class TestSendMessagePaths(unittest.TestCase):
    def _patch_auto(self, ok: bool, err: str = ""):
        return patch(
            "actions.send_message._send_for_platform",
            return_value=(ok, err),
        )

    def test_desktop_automation_success(self) -> None:
        with self._patch_auto(True):
            out = send_message(
                {"platform": "whatsapp", "recipient": "Alice", "message_text": "Hey"}
            )
        self.assertTrue(out["ok"])
        self.assertEqual(out["data"]["method"], "desktop_automation")
        self.assertEqual(out["data"]["platform"], "whatsapp")

    def test_prefer_deep_link_skips_automation(self) -> None:
        with self._patch_auto(True) as auto_mock:
            with patch("actions.send_message._open_url", return_value=True):
                out = send_message(
                    {
                        "platform": "whatsapp",
                        "recipient": "41791234567",
                        "message_text": "Test",
                        "prefer_deep_link": True,
                    }
                )
        auto_mock.assert_not_called()
        self.assertTrue(out["ok"])
        self.assertEqual(out["data"]["method"], "deep_link")

    def test_automation_failure_falls_back_to_deep_link(self) -> None:
        with self._patch_auto(False, "no window"):
            with patch("actions.send_message._open_url", return_value=True):
                out = send_message(
                    {"platform": "telegram", "recipient": "mybot", "message_text": "Hi"}
                )
        self.assertTrue(out["ok"])
        self.assertEqual(out["data"]["method"], "deep_link")

    def test_email_skips_automation_by_default(self) -> None:
        with self._patch_auto(True) as auto_mock:
            with patch("actions.send_message._open_url", return_value=True):
                send_message(
                    {"platform": "email", "recipient": "u@v.com", "message_text": "Hi"}
                )
        auto_mock.assert_not_called()

    def test_aliases_resolved(self) -> None:
        with self._patch_auto(True):
            out = send_message({"platform": "tg", "recipient": "x", "message_text": "y"})
        self.assertEqual(out["data"]["platform"], "telegram")

    def test_unknown_platform_returns_error(self) -> None:
        out = send_message({"platform": "fax", "recipient": "x", "message_text": "y"})
        self.assertFalse(out["ok"])
        self.assertIn("platform", out["error"].lower())

    def test_missing_message_returns_error(self) -> None:
        out = send_message({"platform": "whatsapp", "recipient": "x", "message_text": ""})
        self.assertFalse(out["ok"])

    def test_pyautogui_unavailable_falls_back(self) -> None:
        with patch(
            "actions.send_message._send_for_platform",
            side_effect=RuntimeError("pyautogui not installed"),
        ):
            with patch("actions.send_message._open_url", return_value=True):
                out = send_message(
                    {"platform": "whatsapp", "recipient": "41791234567", "message_text": "Test"}
                )
        self.assertTrue(out["ok"])
        self.assertEqual(out["data"]["method"], "deep_link")

    def test_clipboard_last_resort(self) -> None:
        with self._patch_auto(False, "err"):
            with patch("actions.send_message._open_url", return_value=False):
                with patch("actions.send_message._copy_to_clipboard"):
                    out = send_message(
                        {"platform": "telegram", "recipient": "x", "message_text": "fallback"}
                    )
        self.assertEqual(out["data"]["method"], "clipboard_fallback")
        self.assertTrue(out["data"]["clipboard"])

    def test_signal_and_discord_routed(self) -> None:
        for plat in ("signal", "discord"):
            with self._patch_auto(True):
                out = send_message({"platform": plat, "recipient": "x", "message_text": "y"})
            self.assertTrue(out["ok"])
            self.assertEqual(out["data"]["platform"], plat)


# ── smoke tests (no real automation) ─────────────────────────────────────────

class TestOpenUrl(unittest.TestCase):
    def test_open_https(self) -> None:
        with patch("webbrowser.open", return_value=True):
            ok, _ = open_url_cross_platform("https://example.com/")
        self.assertTrue(ok)


class TestClipboard(unittest.TestCase):
    def test_clipboard_roundtrip_smoke(self) -> None:
        if not copy_text_to_clipboard("pytest-send-message"):
            self.skipTest("Clipboard unavailable in this environment")


if __name__ == "__main__":
    unittest.main()
