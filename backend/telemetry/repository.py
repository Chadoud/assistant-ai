"""SQLite persistence for telemetry batches and feedback."""

from __future__ import annotations

import json
import sqlite3
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Generator

_lock = threading.Lock()


def _connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path), check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


@contextmanager
def _conn(db_path: Path) -> Generator[sqlite3.Connection, None, None]:
    """Open, yield, and always close a telemetry connection.

    sqlite3.Connection used as `with conn:` only manages transactions —
    it never closes the underlying file handle. This wrapper does.
    """
    conn = _connect(db_path)
    try:
        yield conn
    finally:
        conn.close()


def init_db(db_path: Path) -> None:
    with _conn(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS telemetry_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                received_at_ms INTEGER NOT NULL,
                instance_id TEXT NOT NULL,
                app_version TEXT,
                platform TEXT,
                locale TEXT,
                payload_json TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS telemetry_feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                received_at_ms INTEGER NOT NULL,
                instance_id TEXT NOT NULL,
                category TEXT NOT NULL,
                app_version TEXT,
                locale TEXT,
                message TEXT NOT NULL
            )
            """
        )
        conn.commit()


class TelemetryRepository:
    def __init__(self, db_path: Path) -> None:
        self._db_path = db_path
        init_db(db_path)

    def insert_batch(self, row: dict[str, Any]) -> None:
        now = int(time.time() * 1000)
        payload = json.dumps(row["events"], separators=(",", ":"))
        with _lock:
            with _conn(self._db_path) as conn:
                conn.execute(
                    """
                    INSERT INTO telemetry_events
                    (received_at_ms, instance_id, app_version, platform, locale, payload_json)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        now,
                        row["instance_id"],
                        row["app_version"],
                        row["platform"],
                        row["locale"],
                        payload,
                    ),
                )
                conn.commit()

    def insert_feedback(self, row: dict[str, Any]) -> None:
        now = int(time.time() * 1000)
        with _lock:
            with _conn(self._db_path) as conn:
                conn.execute(
                    """
                    INSERT INTO telemetry_feedback
                    (received_at_ms, instance_id, category, app_version, locale, message)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        now,
                        row["instance_id"],
                        row["category"],
                        row["app_version"],
                        row["locale"],
                        row["message"],
                    ),
                )
                conn.commit()

    def delete_older_than_ms(self, cutoff_ms: int) -> dict[str, int]:
        """Remove telemetry rows received before ``cutoff_ms`` (epoch ms)."""
        with _lock:
            with _conn(self._db_path) as conn:
                ev = conn.execute(
                    "DELETE FROM telemetry_events WHERE received_at_ms < ?",
                    (cutoff_ms,),
                ).rowcount
                fb = conn.execute(
                    "DELETE FROM telemetry_feedback WHERE received_at_ms < ?",
                    (cutoff_ms,),
                ).rowcount
                conn.commit()
        return {"telemetry_events": ev, "telemetry_feedback": fb}
