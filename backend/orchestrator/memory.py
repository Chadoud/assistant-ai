"""Episodic long-term memory with lexical retrieval.

Complements the structured key/value store in ``assistant_memory`` (semantic
facts) with free-text *episodes* — what the agent did, what happened, and what
failed — that can be recalled by relevance for a new task.

Retrieval is deterministic **lexical** scoring (token overlap with rarity and
recency weighting). It needs no embedding model or API, so it works offline and
is fully testable; the ``recall`` interface is intentionally swappable for a
vector backend later without changing callers.
"""

from __future__ import annotations

import logging
import math
import re
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from assistant_memory import memory_db_path

logger = logging.getLogger(__name__)

KIND_EPISODE = "episode"
KIND_FAILURE = "failure"
KIND_SKILL = "skill"

_MAX_ENTRIES = 500  # oldest episodes are evicted beyond this
_TOKEN_RE = re.compile(r"[a-z0-9]+")
_STOPWORDS = frozenset({
    "the", "a", "an", "and", "or", "to", "of", "in", "on", "for", "with", "is",
    "it", "this", "that", "my", "me", "i", "you", "your", "do", "did", "was",
    "are", "be", "at", "by", "as", "from", "so", "if", "then", "what", "how",
})

_DDL = """
CREATE TABLE IF NOT EXISTS episodic_memory (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    kind       TEXT    NOT NULL,
    content    TEXT    NOT NULL,
    tags       TEXT    NOT NULL DEFAULT '',
    importance REAL    NOT NULL DEFAULT 1.0,
    created_at TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_episodic_kind ON episodic_memory (kind);
"""


@dataclass
class Memory:
    """One recalled episodic memory."""

    id: int
    kind: str
    content: str
    tags: list[str]
    importance: float
    created_at: str


def _path() -> Path:
    return memory_db_path()


def _connect() -> sqlite3.Connection:
    path = _path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.executescript(_DDL)
    conn.commit()
    return conn


def _tokenize(text: str) -> list[str]:
    return [t for t in _TOKEN_RE.findall((text or "").lower()) if t not in _STOPWORDS and len(t) > 1]


def _row_to_memory(row: sqlite3.Row) -> Memory:
    tags = [t for t in str(row["tags"]).split(",") if t]
    return Memory(int(row["id"]), str(row["kind"]), str(row["content"]), tags,
                  float(row["importance"]), str(row["created_at"]))


def remember(content: str, *, kind: str = KIND_EPISODE, tags: list[str] | None = None,
             importance: float = 1.0) -> None:
    """Store one episodic memory. Evicts the oldest beyond ``_MAX_ENTRIES``."""
    content = (content or "").strip()
    if not content:
        return
    tag_str = ",".join(sorted({t.strip().lower() for t in (tags or []) if t.strip()}))
    now = datetime.now(UTC).isoformat()
    try:
        conn = _connect()
        try:
            conn.execute(
                "INSERT INTO episodic_memory (kind, content, tags, importance, created_at) VALUES (?,?,?,?,?)",
                (kind, content[:4000], tag_str, float(importance), now),
            )
            conn.execute(
                """DELETE FROM episodic_memory WHERE id IN (
                       SELECT id FROM episodic_memory ORDER BY created_at DESC LIMIT -1 OFFSET ?
                   )""",
                (_MAX_ENTRIES,),
            )
            conn.commit()
        finally:
            conn.close()
    except Exception:
        logger.exception("episodic remember failed")


def _load_all() -> list[sqlite3.Row]:
    conn = _connect()
    try:
        return conn.execute(
            "SELECT id, kind, content, tags, importance, created_at FROM episodic_memory"
        ).fetchall()
    finally:
        conn.close()


def recall(query: str, *, k: int = 5, kinds: list[str] | None = None) -> list[Memory]:
    """Return up to ``k`` memories most relevant to ``query`` by lexical score.

    Scoring: sum of inverse-document-frequency weights for query tokens present in
    a memory, scaled by the memory's importance, with recency as the tiebreaker.
    """
    query_tokens = set(_tokenize(query))
    if not query_tokens:
        return []
    try:
        rows = _load_all()
    except Exception:
        logger.exception("episodic recall failed")
        return []
    if kinds:
        wanted = set(kinds)
        rows = [r for r in rows if str(r["kind"]) in wanted]
    if not rows:
        return []

    # Document frequency per token → rarer tokens carry more weight.
    doc_tokens: list[set[str]] = [set(_tokenize(str(r["content"])) + str(r["tags"]).split(",")) for r in rows]
    total_docs = len(rows)
    df: dict[str, int] = {}
    for tokens in doc_tokens:
        for tok in tokens & query_tokens:
            df[tok] = df.get(tok, 0) + 1

    scored: list[tuple[float, str, sqlite3.Row]] = []
    for row, tokens in zip(rows, doc_tokens):
        matched = tokens & query_tokens
        if not matched:
            continue
        idf = sum(math.log((total_docs + 1) / (df.get(tok, 0) + 0.5)) for tok in matched)
        score = idf * max(float(row["importance"]), 0.1)
        scored.append((score, str(row["created_at"]), row))

    scored.sort(key=lambda s: (s[0], s[1]), reverse=True)
    return [_row_to_memory(row) for _, _, row in scored[:k]]


def recent(k: int = 5, *, kinds: list[str] | None = None) -> list[Memory]:
    """Return the ``k`` most recent memories (optionally filtered by kind)."""
    try:
        conn = _connect()
        try:
            if kinds:
                placeholders = ",".join("?" * len(kinds))
                rows = conn.execute(
                    f"SELECT * FROM episodic_memory WHERE kind IN ({placeholders}) "
                    "ORDER BY created_at DESC LIMIT ?",
                    (*kinds, k),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM episodic_memory ORDER BY created_at DESC LIMIT ?", (k,)
                ).fetchall()
            return [_row_to_memory(r) for r in rows]
        finally:
            conn.close()
    except Exception:
        logger.exception("episodic recent failed")
        return []


class EpisodicAdapter:
    """Thin recall/remember surface the agent loop depends on (swappable backend)."""

    def recall(self, query: str, *, k: int = 4) -> list[str]:
        return [m.content for m in recall(query, k=k)]

    def remember_outcome(self, goal: str, summary: str, ok: bool) -> None:
        kind = KIND_EPISODE if ok else KIND_FAILURE
        # Slightly favor recalling failures so the agent avoids repeating them.
        importance = 1.0 if ok else 1.5
        remember(f"Goal: {goal}\nOutcome: {summary}", kind=kind, tags=_tokenize(goal)[:8],
                 importance=importance)


def default_adapter() -> EpisodicAdapter:
    return EpisodicAdapter()


def clear_all() -> None:
    """Wipe episodic memory (used by tests and a user 'forget everything')."""
    try:
        conn = _connect()
        try:
            conn.execute("DELETE FROM episodic_memory")
            conn.commit()
        finally:
            conn.close()
    except Exception:
        logger.exception("episodic clear failed")


def forget(memory_id: int) -> bool:
    """Delete one episodic memory row by id. Returns True if a row was removed."""
    try:
        conn = _connect()
        try:
            cur = conn.execute("DELETE FROM episodic_memory WHERE id = ?", (int(memory_id),))
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()
    except Exception:
        logger.exception("episodic forget failed")
        return False
