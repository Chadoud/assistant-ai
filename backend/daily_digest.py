"""
Daily digest: an end-of-day (or on-demand) recap of what happened.

Pulls the day's conversation summaries, distilled screen activity, and open tasks,
then asks a cloud LLM for a tight recap (headline, highlights, decisions,
unresolved questions, suggested focus). The result is persisted so the app can
show a digest card and fire a single OS notification.

Honest by construction: every input is real stored data; when no LLM is
configured we still return a deterministic, non-LLM digest assembled from counts
and the most recent items rather than fabricating narrative.
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, Generator

from llm.complete import complete

logger = logging.getLogger(__name__)


def _db_path() -> Path:
    base = os.environ.get("EXOSITES_DATA_DIR", "")
    if base:
        return Path(base) / "digests.sqlite"
    return Path(__file__).parent / "telemetry" / "data" / "digests.sqlite"


_DDL = """
CREATE TABLE IF NOT EXISTS digests (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    date        TEXT NOT NULL,
    headline    TEXT NOT NULL DEFAULT '',
    body_json   TEXT NOT NULL DEFAULT '{}',
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_digests_date ON digests (date);
"""


@contextmanager
def _conn() -> Generator[sqlite3.Connection, None, None]:
    path = _db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.executescript(_DDL)
    conn.commit()
    try:
        yield conn
    finally:
        conn.close()


_SYSTEM = "You write a brief, useful end-of-day digest. Output STRICT JSON only."

_INSTRUCTION = """Given today's data, return a single JSON object with EXACTLY:
{
  "headline": "one-line summary of the day",
  "highlights": ["notable thing", "..."],
  "decisions": ["decision made", "..."],
  "unresolved": ["open question / loose end", "..."],
  "focus_tomorrow": ["suggested focus", "..."]
}
Use empty arrays where nothing applies. Output JSON ONLY.

Today's data:
"""


def _gather_inputs() -> tuple[str, dict[str, Any]]:
    """Collect the day's real data; returns (prompt_text, raw_counts)."""
    import activity_store
    import conversation_store
    import tasks_store
    from signal_quality import SignalTier, evaluate_text

    since = (datetime.now(UTC) - timedelta(hours=24)).isoformat()

    conversations = [
        c for c in conversation_store.list_conversations(limit=50) if c["updated_at"] >= since
    ]
    activity = activity_store.list_activity(limit=80, since=since)
    open_tasks = tasks_store.list_tasks(include_completed=False)
    done_today = [
        t
        for t in tasks_store.list_tasks(include_completed=True)
        if t["completed"] and (t.get("completed_at") or "") >= since
    ]

    lines: list[str] = []
    if conversations:
        lines.append("Conversations:")
        for c in conversations[:15]:
            lines.append(f"- {c['title']}: {c['summary']}".strip())
    if activity:
        lines.append("\nScreen activity:")
        for a in activity[:25]:
            lines.append(f"- {a['summary']}")
    if done_today:
        lines.append("\nCompleted tasks:")
        for t in done_today[:20]:
            desc = str(t["description"])
            if evaluate_text(desc).tier == SignalTier.REJECT:
                continue
            lines.append(f"- {desc}")
    if open_tasks:
        lines.append("\nOpen tasks:")
        for t in open_tasks[:20]:
            desc = str(t["description"])
            if evaluate_text(desc).tier == SignalTier.REJECT:
                continue
            lines.append(f"- {desc}")

    counts = {
        "conversations": len(conversations),
        "activity": len(activity),
        "open_tasks": len(open_tasks),
        "completed_today": len(done_today),
    }
    return "\n".join(lines).strip(), counts


def _fallback_digest(counts: dict[str, Any]) -> dict[str, Any]:
    """Deterministic digest when no LLM is available — counts, not invented prose."""
    headline = (
        f"{counts['conversations']} conversations, "
        f"{counts['completed_today']} tasks done, "
        f"{counts['open_tasks']} still open"
    )
    return {
        "headline": headline,
        "highlights": [],
        "decisions": [],
        "unresolved": [],
        "focus_tomorrow": [],
        "counts": counts,
        "llm": False,
    }


def generate_digest() -> dict[str, Any]:
    """Build today's digest, persist it, and return it."""
    prompt_text, counts = _gather_inputs()
    today = datetime.now(UTC).strftime("%Y-%m-%d")

    if not prompt_text:
        body = _fallback_digest(counts)
        body["headline"] = "Nothing recorded yet today."
        return _persist(today, body)

    raw = complete(_SYSTEM, _INSTRUCTION + prompt_text[:12000])
    if not raw:
        return _persist(today, _fallback_digest(counts))

    from memory_extract import _parse_json_object

    parsed = _parse_json_object(raw)
    if not parsed:
        return _persist(today, _fallback_digest(counts))

    parsed.setdefault("headline", _fallback_digest(counts)["headline"])
    parsed["counts"] = counts
    parsed["llm"] = True
    return _persist(today, parsed)


def _persist(date: str, body: dict[str, Any]) -> dict[str, Any]:
    now = datetime.now(UTC).isoformat()
    headline = str(body.get("headline", ""))[:300]
    payload = json.dumps(body, ensure_ascii=False)
    with _conn() as conn:
        existing = conn.execute(
            "SELECT id FROM digests WHERE date = ? ORDER BY created_at DESC LIMIT 1",
            (date,),
        ).fetchone()
        if existing:
            digest_id = int(existing["id"])
            conn.execute(
                "UPDATE digests SET headline=?, body_json=?, created_at=? WHERE id=?",
                (headline, payload, now, digest_id),
            )
        else:
            cur = conn.execute(
                "INSERT INTO digests (date, headline, body_json, created_at) "
                "VALUES (?, ?, ?, ?) RETURNING id",
                (date, headline, payload, now),
            )
            row = cur.fetchone()
            digest_id = int(row["id"]) if row else -1
        conn.commit()
    return {"id": digest_id, "date": date, "created_at": now, **body}


def latest_digest() -> dict[str, Any] | None:
    with _conn() as conn:
        row = conn.execute(
            "SELECT * FROM digests ORDER BY created_at DESC LIMIT 1"
        ).fetchone()
    if not row:
        return None
    body = json.loads(row["body_json"]) if row["body_json"] else {}
    return {
        "id": int(row["id"]),
        "date": str(row["date"]),
        "created_at": str(row["created_at"]),
        **body,
    }


def list_digests(limit: int = 14) -> list[dict[str, Any]]:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT id, date, headline, created_at FROM digests "
            "ORDER BY created_at DESC LIMIT ?",
            (max(1, limit),),
        ).fetchall()
    return [
        {
            "id": int(r["id"]),
            "date": str(r["date"]),
            "headline": str(r["headline"]),
            "created_at": str(r["created_at"]),
        }
        for r in rows
    ]
