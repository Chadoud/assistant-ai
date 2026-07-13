"""Tests for WhatsApp event store and session window."""

from __future__ import annotations

import time

from whatsapp_event_store import (
    clear_events_for_tests,
    delivery_status,
    ingest_events,
    recent_events,
    session_check,
)


def setup_function() -> None:
    clear_events_for_tests()


def test_ingest_and_list_recent_messages() -> None:
    ingest_events(
        [
            {
                "event_type": "message",
                "from_e164": "41791234567",
                "body_preview": "Hi",
                "meta_timestamp_ms": int(time.time() * 1000),
            }
        ]
    )
    rows = recent_events(limit=5, event_type="message")
    assert len(rows) == 1
    assert rows[0]["body_preview"] == "Hi"


def test_session_open_within_24h() -> None:
    ingest_events(
        [
            {
                "event_type": "message",
                "from_e164": "41791234567",
                "meta_timestamp_ms": int(time.time() * 1000),
            }
        ]
    )
    check = session_check("+41791234567")
    assert check.open is True


def test_delivery_status_tracks_latest() -> None:
    ingest_events(
        [
            {
                "event_type": "status",
                "wa_message_id": "wamid.1",
                "to_e164": "41791234567",
                "status": "sent",
                "meta_timestamp_ms": 1000,
            },
            {
                "event_type": "status",
                "wa_message_id": "wamid.1",
                "to_e164": "41791234567",
                "status": "delivered",
                "meta_timestamp_ms": 2000,
            },
        ]
    )
    row = delivery_status("wamid.1")
    assert row is not None
    assert row["status"] == "delivered"
