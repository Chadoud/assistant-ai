"""
Screen-activity timeline store backed by SQLite.

Holds the DISTILLED output of the activity-capture pipeline — short, plain-language
descriptions of what the user was doing (app + window title + a one-line summary).
Raw screenshots are never stored: they are described in memory and discarded, so
this table is the only persisted artifact and contains no pixels.
"""

from __future__ import annotations

import logging
import os
import re
import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, Generator

logger = logging.getLogger(__name__)

_EMAIL_IN_TITLE = re.compile(r"\S+@\S+")
_MAX_TITLE_LEN = 80


def _sanitize_activity_title(title: str) -> str:
    """Reduce PII in window titles before persistence."""
    text = str(title or "").strip()
    if "<built-in method" in text or "<bound method" in text:
        return ""
    cleaned = _EMAIL_IN_TITLE.sub("[email]", text)
    return cleaned[:_MAX_TITLE_LEN]


def _db_path() -> Path:
    base = os.environ.get("EXOSITES_DATA_DIR", "")
    if base:
        return Path(base) / "activity.sqlite"
    return Path(__file__).parent / "telemetry" / "data" / "activity.sqlite"


def activity_db_path() -> Path:
    return _db_path()


_DDL = """
CREATE TABLE IF NOT EXISTS activity_entries (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    app         TEXT NOT NULL DEFAULT '',
    title       TEXT NOT NULL DEFAULT '',
    summary     TEXT NOT NULL DEFAULT '',
    captured_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_captured ON activity_entries (captured_at);
"""


def _connect() -> sqlite3.Connection:
    path = _db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.executescript(_DDL)
    conn.commit()
    return conn


@contextmanager
def _conn() -> Generator[sqlite3.Connection, None, None]:
    conn = _connect()
    try:
        yield conn
    finally:
        conn.close()


def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "app": str(row["app"]),
        "title": str(row["title"]),
        "summary": str(row["summary"]),
        "captured_at": str(row["captured_at"]),
    }


def add_activity(app: str, title: str, summary: str) -> dict[str, Any]:
    now = datetime.now(UTC).isoformat()
    with _conn() as conn:
        cur = conn.execute(
            "INSERT INTO activity_entries (app, title, summary, captured_at) "
            "VALUES (?, ?, ?, ?) RETURNING *",
            (app.strip()[:200], _sanitize_activity_title(title), summary.strip()[:600], now),
        )
        row = cur.fetchone()
        conn.commit()
        return _row_to_dict(row)


def list_activity(*, limit: int = 200, since: str | None = None) -> list[dict[str, Any]]:
    clause = "WHERE captured_at >= ?" if since else ""
    params: list[Any] = [since] if since else []
    params.append(max(1, limit))
    with _conn() as conn:
        rows = conn.execute(
            f"SELECT * FROM activity_entries {clause} ORDER BY captured_at DESC LIMIT ?",
            params,
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


def recent_summaries(limit: int = 50) -> list[str]:
    """Plain summaries for digest/briefing generation, newest-first."""
    return [e["summary"] for e in list_activity(limit=limit) if e["summary"]]


def prune_older_than(days: int) -> int:
    """Delete entries older than ``days`` (retention setting). Returns rows removed."""
    cutoff = (datetime.now(UTC) - timedelta(days=max(0, days))).isoformat()
    with _conn() as conn:
        cur = conn.execute("DELETE FROM activity_entries WHERE captured_at < ?", (cutoff,))
        conn.commit()
        return cur.rowcount


def clear_activity() -> None:
    with _conn() as conn:
        conn.execute("DELETE FROM activity_entries")
        conn.commit()
