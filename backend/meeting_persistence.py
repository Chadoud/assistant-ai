"""
Crash-safe persistence for in-progress meeting transcripts.

Active meetings are mirrored to SQLite so a backend restart does not lose notes.
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Generator

logger = logging.getLogger(__name__)


def _db_path() -> Path:
    base = os.environ.get("EXOSITES_DATA_DIR", "")
    if base:
        return Path(base) / "meetings.sqlite"
    return Path(__file__).parent / "telemetry" / "data" / "meetings.sqlite"


_DDL = """
CREATE TABLE IF NOT EXISTS meeting_drafts (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL DEFAULT '',
    lines_json  TEXT NOT NULL DEFAULT '[]',
    started_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
"""


def _connect() -> sqlite3.Connection:
    path = _db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.executescript(_DDL)
    return conn


@contextmanager
def _conn() -> Generator[sqlite3.Connection, None, None]:
    conn = _connect()
    try:
        yield conn
    finally:
        conn.close()


def upsert_draft(meeting_id: str, title: str, lines: list[str], started_at: str, updated_at: str) -> None:
    with _conn() as conn:
        conn.execute(
            """
            INSERT INTO meeting_drafts (id, title, lines_json, started_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET
                title=excluded.title,
                lines_json=excluded.lines_json,
                updated_at=excluded.updated_at
            """,
            (meeting_id, title, json.dumps(lines), started_at, updated_at),
        )
        conn.commit()


def load_draft(meeting_id: str) -> dict[str, Any] | None:
    with _conn() as conn:
        row = conn.execute("SELECT * FROM meeting_drafts WHERE id=?", (meeting_id,)).fetchone()
    if not row:
        return None
    try:
        lines = json.loads(row["lines_json"] or "[]")
    except json.JSONDecodeError:
        lines = []
    return {
        "id": row["id"],
        "title": row["title"],
        "lines": lines if isinstance(lines, list) else [],
        "started_at": row["started_at"],
        "updated_at": row["updated_at"],
    }


def delete_draft(meeting_id: str) -> None:
    with _conn() as conn:
        conn.execute("DELETE FROM meeting_drafts WHERE id=?", (meeting_id,))
        conn.commit()


def list_drafts() -> list[dict[str, Any]]:
    with _conn() as conn:
        rows = conn.execute("SELECT * FROM meeting_drafts ORDER BY updated_at DESC").fetchall()
    out: list[dict[str, Any]] = []
    for row in rows:
        draft = load_draft(str(row["id"]))
        if draft:
            out.append(draft)
    return out
