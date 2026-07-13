"""Tests for GET /integration/whatsapp-health."""

from __future__ import annotations

import unittest

from fastapi.testclient import TestClient

from main import app
from whatsapp_event_store import ingest_events


class WhatsAppHealthRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)
        ingest_events(
            [
                {
                    "event_type": "message",
                    "wa_message_id": "wamid.in.1",
                    "from_e164": "41791234567",
                    "meta_timestamp_ms": 1_700_000_000_000,
                }
            ]
        )

    def test_whatsapp_health_returns_inbound_summary(self) -> None:
        res = self.client.get("/integration/whatsapp-health")
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertTrue(body.get("ok"))
        self.assertGreaterEqual(body.get("inbound_count", 0), 1)
        self.assertIsInstance(body.get("last_inbound_ms"), int)


if __name__ == "__main__":
    unittest.main()
