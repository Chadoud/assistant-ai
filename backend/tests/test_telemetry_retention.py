"""Tests for opt-in telemetry SQLite retention."""

from __future__ import annotations

import sqlite3
import time
from pathlib import Path

from telemetry.repository import TelemetryRepository
from telemetry.retention import TELEMETRY_RETENTION_DAYS, prune_telemetry_older_than


def _insert_event(db: Path, received_at_ms: int) -> None:
    repo = TelemetryRepository(db)
    repo.insert_batch(
        {
            "instance_id": "inst-1",
            "app_version": "test",
            "platform": "test",
            "locale": "en",
            "events": [{"name": "app_started", "props": {}}],
        }
    )
    conn = sqlite3.connect(str(db))
    try:
        conn.execute(
            "UPDATE telemetry_events SET received_at_ms = ? "
            "WHERE id = (SELECT MAX(id) FROM telemetry_events)",
            (received_at_ms,),
        )
        conn.commit()
    finally:
        conn.close()


def test_prune_telemetry_removes_old_rows(tmp_path: Path, monkeypatch) -> None:
    db = tmp_path / "telemetry.sqlite"
    monkeypatch.setenv("TELEMETRY_SQLITE_PATH", str(db))

    old_ms = int((time.time() - (TELEMETRY_RETENTION_DAYS + 5) * 86_400) * 1000)
    recent_ms = int((time.time() - 2 * 86_400) * 1000)
    _insert_event(db, old_ms)
    _insert_event(db, recent_ms)

    removed = prune_telemetry_older_than(TELEMETRY_RETENTION_DAYS)
    assert removed["telemetry_events"] == 1

    conn = sqlite3.connect(str(db))
    try:
        count = conn.execute("SELECT COUNT(*) FROM telemetry_events").fetchone()[0]
    finally:
        conn.close()
    assert count == 1
