"""
Durable conversation store backed by SQLite.

Conversations were previously kept only in the renderer's localStorage (capped,
device-local, not searchable by the assistant). This store makes them first-class
knowledge: each conversation carries an Omi-style structured summary (title,
overview, category, emoji, action items) so the assistant can recall and cite
past discussions via the ``search_conversations`` tool.

The renderer remains the source of truth for live editing; it upserts here on
close/idle and on first load imports any existing local conversations.
"""

from __future__ import annotations

import json
import logging
import os
import re
import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Generator

logger = logging.getLogger(__name__)

MAX_MESSAGES_STORED = 400
_TOKEN_RE = re.compile(r"[A-Za-z0-9]{2,}")


def _db_path() -> Path:
    base = os.environ.get("EXOSITES_DATA_DIR", "")
    if base:
        return Path(base) / "conversations.sqlite"
    return Path(__file__).parent / "telemetry" / "data" / "conversations.sqlite"


def conversations_db_path() -> Path:
    return _db_path()


_DDL = """
CREATE TABLE IF NOT EXISTS conversations (
    id            TEXT PRIMARY KEY,
    title         TEXT NOT NULL DEFAULT '',
    summary       TEXT NOT NULL DEFAULT '',
    category      TEXT DEFAULT NULL,
    emoji         TEXT DEFAULT NULL,
    messages_json TEXT NOT NULL DEFAULT '[]',
    action_items_json TEXT NOT NULL DEFAULT '[]',
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations (updated_at);
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


def _row_to_dict(row: sqlite3.Row, *, include_messages: bool = False) -> dict[str, Any]:
    out: dict[str, Any] = {
        "id": str(row["id"]),
        "title": str(row["title"]),
        "summary": str(row["summary"]),
        "category": row["category"],
        "emoji": row["emoji"],
        "action_items": _safe_json(row["action_items_json"], []),
        "created_at": str(row["created_at"]),
        "updated_at": str(row["updated_at"]),
    }
    if include_messages:
        out["messages"] = _safe_json(row["messages_json"], [])
    return out


def _safe_json(raw: Any, default: Any) -> Any:
    try:
        return json.loads(raw) if raw else default
    except (json.JSONDecodeError, TypeError):
        return default


def upsert_conversation(
    conversation_id: str,
    *,
    title: str = "",
    summary: str = "",
    category: str | None = None,
    emoji: str | None = None,
    messages: list[dict[str, Any]] | None = None,
    action_items: list[str] | None = None,
    created_at: str | None = None,
) -> dict[str, Any]:
    """Insert or update a conversation, preserving created_at on update."""
    cid = (conversation_id or "").strip()
    if not cid:
        raise ValueError("conversation id is required")
    now = datetime.now(UTC).isoformat()
    trimmed = (messages or [])[-MAX_MESSAGES_STORED:]
    messages_json = json.dumps(trimmed, ensure_ascii=False)
    action_items_json = json.dumps(action_items or [], ensure_ascii=False)
    with _conn() as conn:
        existing = conn.execute(
            "SELECT created_at FROM conversations WHERE id=?", (cid,)
        ).fetchone()
        created = existing["created_at"] if existing else (created_at or now)
        conn.execute(
            """
            INSERT INTO conversations
                (id, title, summary, category, emoji, messages_json,
                 action_items_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET
                title=excluded.title,
                summary=excluded.summary,
                category=excluded.category,
                emoji=excluded.emoji,
                messages_json=excluded.messages_json,
                action_items_json=excluded.action_items_json,
                updated_at=excluded.updated_at
            """,
            (
                cid, title.strip(), summary.strip(), category, emoji,
                messages_json, action_items_json, created, now,
            ),
        )
        conn.commit()
    result = get_conversation(cid)
    assert result is not None
    return result


def get_conversation(
    conversation_id: str,
    *,
    include_messages: bool = True,
) -> dict[str, Any] | None:
    with _conn() as conn:
        row = conn.execute(
            "SELECT * FROM conversations WHERE id=?", (conversation_id,)
        ).fetchone()
    return _row_to_dict(row, include_messages=include_messages) if row else None


def list_conversations(limit: int = 100) -> list[dict[str, Any]]:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT * FROM conversations ORDER BY updated_at DESC LIMIT ?",
            (max(1, limit),),
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


def delete_conversation(conversation_id: str) -> bool:
    with _conn() as conn:
        cur = conn.execute("DELETE FROM conversations WHERE id=?", (conversation_id,))
        conn.commit()
        return cur.rowcount > 0


def clear_all_conversations() -> int:
    """Remove every stored conversation (local erasure)."""
    with _conn() as conn:
        cur = conn.execute("DELETE FROM conversations")
        conn.commit()
        return cur.rowcount


def _tokens(text: str) -> set[str]:
    return {t.lower() for t in _TOKEN_RE.findall(text or "")}


# Only blend embeddings for a small candidate set to bound latency.
_EMBED_CANDIDATE_LIMIT = 25


def _conversation_haystack(row: dict[str, Any]) -> str:
    return f"{row['title']} {row['summary']} {' '.join(str(a) for a in row['action_items'])}"


def search_conversations(
    query: str, *, limit: int = 5, use_embeddings: bool = True
) -> list[dict[str, Any]]:
    """Rank conversations by relevance to ``query`` (title + summary + action items).

    Lexical token overlap by default; when cloud/VPS embeddings are available
    the top lexical candidates are re-scored by cosine similarity for better
    recall on paraphrases. Empty query returns the most recent conversations.
    """
    rows = list_conversations(limit=200)
    if not query.strip():
        return [{**r, "score": 0.0} for r in rows[:limit]]

    q_tokens = _tokens(query)
    if not q_tokens:
        return [{**r, "score": 0.0} for r in rows[:limit]]

    scored: list[tuple[float, dict[str, Any]]] = []
    for r in rows:
        e_tokens = _tokens(_conversation_haystack(r))
        if not e_tokens:
            continue
        overlap = len(q_tokens & e_tokens) / len(q_tokens)
        phrase_bonus = 0.25 if query.strip().lower() in _conversation_haystack(r).lower() else 0.0
        score = min(1.0, overlap + phrase_bonus)
        if score > 0:
            scored.append((score, r))
    scored.sort(key=lambda x: x[0], reverse=True)

    if use_embeddings and scored:
        try:
            from semantic_rerank import blend_lexical_with_embeddings

            blended = blend_lexical_with_embeddings(
                query,
                scored,
                _conversation_haystack,
                candidate_limit=_EMBED_CANDIDATE_LIMIT,
            )
            if blended is not None:
                scored = blended
        except Exception:
            logger.debug("conversation embedding blend skipped", exc_info=True)

    return [{**r, "score": round(s, 4)} for s, r in scored[:limit]]
