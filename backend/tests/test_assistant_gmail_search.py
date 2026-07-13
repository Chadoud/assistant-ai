"""Tests for ``POST /assistant/gmail-search`` (metadata preview for Electron tools)."""

import pathlib
import sys
import unittest
import unittest.mock

from fastapi.testclient import TestClient

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from main import app


class TestAssistantGmailSearch(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_gmail_search_returns_redacted_headers(self) -> None:
        import gmail_google_oauth
        import routes.assistant_routes as ar

        calls = {"n": 0}

        def fake_token() -> str:
            return "fake-access-token"

        def fake_list_messages(token: str, *, query: str = "", max_results: int = 500, get_token=None, page_token=None):
            self.assertEqual(token, "fake-access-token")
            return {"messages": [{"id": "msg-1"}]}

        def fake_get_message(token: str, mid: str, **kwargs):
            calls["n"] += 1
            return {
                "payload": {
                    "headers": [
                        {"name": "Subject", "value": "Hello"},
                        {"name": "From", "value": "a@b.com"},
                        {"name": "Date", "value": "Mon, 1 Jan 2026 12:00:00 +0000"},
                    ]
                }
            }

        monkey = unittest.mock.patch.object(gmail_google_oauth, "get_valid_access_token", fake_token)
        monkey2 = unittest.mock.patch.object(ar, "gmail_list_messages", fake_list_messages)
        monkey3 = unittest.mock.patch.object(ar, "gmail_get_message", fake_get_message)
        with monkey, monkey2, monkey3:
            r = self.client.post("/assistant/gmail-search", json={"query": "in:inbox", "max_messages": 5})

        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertTrue(data.get("ok"))
        msgs = data.get("messages") or []
        self.assertEqual(len(msgs), 1)
        self.assertEqual(msgs[0].get("id"), "msg-1")
        self.assertEqual(msgs[0].get("subject"), "Hello")
        self.assertEqual(calls["n"], 1)


if __name__ == "__main__":
    unittest.main()
