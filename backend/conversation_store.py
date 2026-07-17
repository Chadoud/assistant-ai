"""
Durable conversation store backed by SQLite.

Conversations were previously kept only in the renderer's localStorage (capped,
device-local, not searchable by the assistant). This store makes them first-class
knowledge: each conversation carries an Omi-style structured summary (title,
overview, category, emoji, action items) so the assistant can recall and cite
past discussions via the ``search_conversations`` tool.

Retain / forget fields (``retain_tier``, ``retain_score``, …) score whether a
chat belongs on the brain map — see ``signal_quality.retain_policy``.
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

_RETAIN_COLS = (
    "retain_tier",
    "retain_score",
    "retain_reasons",
    "ephemeral",
    "archived_at",
    "last_judged_at",
    "pinned",
)


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
    updated_at    TEXT NOT NULL,
    retain_tier   TEXT NOT NULL DEFAULT 'working',
    retain_score  REAL NOT NULL DEFAULT 0.5,
    retain_reasons TEXT NOT NULL DEFAULT '[]',
    ephemeral     INTEGER NOT NULL DEFAULT 0,
    archived_at   TEXT DEFAULT NULL,
    last_judged_at TEXT DEFAULT NULL,
    pinned        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations (updated_at);
"""


def _migrate_schema(conn: sqlite3.Connection) -> None:
    info = conn.execute("PRAGMA table_info(conversations)").fetchall()
    existing = {str(r["name"]) for r in info}
    alters = [
        ("retain_tier", "ALTER TABLE conversations ADD COLUMN retain_tier TEXT NOT NULL DEFAULT 'working'"),
        ("retain_score", "ALTER TABLE conversations ADD COLUMN retain_score REAL NOT NULL DEFAULT 0.5"),
        ("retain_reasons", "ALTER TABLE conversations ADD COLUMN retain_reasons TEXT NOT NULL DEFAULT '[]'"),
        ("ephemeral", "ALTER TABLE conversations ADD COLUMN ephemeral INTEGER NOT NULL DEFAULT 0"),
        ("archived_at", "ALTER TABLE conversations ADD COLUMN archived_at TEXT DEFAULT NULL"),
        ("last_judged_at", "ALTER TABLE conversations ADD COLUMN last_judged_at TEXT DEFAULT NULL"),
        ("pinned", "ALTER TABLE conversations ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0"),
    ]
    for col, sql in alters:
        if col not in existing:
            conn.execute(sql)
    conn.commit()


def _connect() -> sqlite3.Connection:
    path = _db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.executescript(_DDL)
    _migrate_schema(conn)
    conn.commit()
    return conn


@contextmanager
def _conn() -> Generator[sqlite3.Connection, None, None]:
    conn = _connect()
    try:
        yield conn
    finally:
        conn.close()


def _safe_json(raw: Any, default: Any) -> Any:
    try:
        return json.loads(raw) if raw else default
    except (json.JSONDecodeError, TypeError):
        return default


def _row_keys(row: sqlite3.Row) -> set[str]:
    return set(row.keys())


def _row_to_dict(row: sqlite3.Row, *, include_messages: bool = False) -> dict[str, Any]:
    keys = _row_keys(row)
    out: dict[str, Any] = {
        "id": str(row["id"]),
        "title": str(row["title"]),
        "summary": str(row["summary"]),
        "category": row["category"],
        "emoji": row["emoji"],
        "action_items": _safe_json(row["action_items_json"], []),
        "created_at": str(row["created_at"]),
        "updated_at": str(row["updated_at"]),
        "retain_tier": str(row["retain_tier"]) if "retain_tier" in keys else "working",
        "retain_score": float(row["retain_score"]) if "retain_score" in keys else 0.5,
        "retain_reasons": _safe_json(row["retain_reasons"], []) if "retain_reasons" in keys else [],
        "ephemeral": bool(int(row["ephemeral"])) if "ephemeral" in keys else False,
        "archived_at": row["archived_at"] if "archived_at" in keys else None,
        "last_judged_at": row["last_judged_at"] if "last_judged_at" in keys else None,
        "pinned": bool(int(row["pinned"])) if "pinned" in keys else False,
    }
    if include_messages:
        out["messages"] = _safe_json(row["messages_json"], [])
    return out


def _compute_retain(
    title: str,
    summary: str,
    *,
    action_items: list[str] | None,
    messages: list[dict[str, Any]] | None,
    memory_link_count: int,
    pinned: bool,
) -> dict[str, Any]:
    from signal_quality.retain_policy import is_retain_policy_enabled, score_conversation

    if not is_retain_policy_enabled():
        return {
            "retain_tier": "working",
            "retain_score": 0.5,
            "retain_reasons": ["policy_disabled"],
            "ephemeral": False,
            "last_judged_at": datetime.now(UTC).isoformat(),
        }
    msg_count = len(messages or [])
    verdict = score_conversation(
        title,
        summary,
        action_item_count=len(action_items or []),
        memory_link_count=max(0, int(memory_link_count)),
        message_count=msg_count,
        pinned=pinned,
    )
    data = verdict.as_dict()
    data["last_judged_at"] = datetime.now(UTC).isoformat()
    return data


def _maybe_backfill_row(conn: sqlite3.Connection, row: sqlite3.Row) -> sqlite3.Row:
    """Lazy-score rows that predate retain columns / never judged."""
    keys = _row_keys(row)
    if "last_judged_at" not in keys:
        return row
    if row["last_judged_at"]:
        return row
    from signal_quality.retain_policy import is_retain_policy_enabled

    if not is_retain_policy_enabled():
        return row

    title = str(row["title"] or "")
    summary = str(row["summary"] or "")
    action_items = _safe_json(row["action_items_json"], [])
    messages = _safe_json(row["messages_json"], [])
    pinned = bool(int(row["pinned"])) if "pinned" in keys else False
    fields = _compute_retain(
        title,
        summary,
        action_items=action_items if isinstance(action_items, list) else [],
        messages=messages if isinstance(messages, list) else [],
        memory_link_count=0,
        pinned=pinned,
    )
    conn.execute(
        """
        UPDATE conversations SET
            retain_tier=?, retain_score=?, retain_reasons=?,
            ephemeral=?, last_judged_at=?
        WHERE id=?
        """,
        (
            fields["retain_tier"],
            fields["retain_score"],
            json.dumps(fields["retain_reasons"], ensure_ascii=False),
            1 if fields["ephemeral"] else 0,
            fields["last_judged_at"],
            str(row["id"]),
        ),
    )
    conn.commit()
    refreshed = conn.execute(
        "SELECT * FROM conversations WHERE id=?", (str(row["id"]),)
    ).fetchone()
    return refreshed or row


def apply_retain_score(
    conversation_id: str,
    *,
    memory_link_count: int | None = None,
    pinned: bool | None = None,
    retain_override: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """Re-score an existing conversation (e.g. after distill stores memories)."""
    cid = (conversation_id or "").strip()
    if not cid:
        return None
    with _conn() as conn:
        row = conn.execute("SELECT * FROM conversations WHERE id=?", (cid,)).fetchone()
        if not row:
            return None
        keys = _row_keys(row)
        is_pinned = bool(int(row["pinned"])) if pinned is None and "pinned" in keys else bool(pinned)
        if pinned is not None:
            is_pinned = bool(pinned)
        if retain_override:
            fields = {
                "retain_tier": retain_override.get("retain_tier", "working"),
                "retain_score": float(retain_override.get("retain_score", 0.5)),
                "retain_reasons": list(retain_override.get("retain_reasons") or []),
                "ephemeral": bool(retain_override.get("ephemeral", False)),
                "last_judged_at": retain_override.get("last_judged_at")
                or datetime.now(UTC).isoformat(),
            }
        else:
            title = str(row["title"] or "")
            summary = str(row["summary"] or "")
            action_items = _safe_json(row["action_items_json"], [])
            messages = _safe_json(row["messages_json"], [])
            links = memory_link_count if memory_link_count is not None else 0
            fields = _compute_retain(
                title,
                summary,
                action_items=action_items if isinstance(action_items, list) else [],
                messages=messages if isinstance(messages, list) else [],
                memory_link_count=links,
                pinned=is_pinned,
            )
        conn.execute(
            """
            UPDATE conversations SET
                retain_tier=?, retain_score=?, retain_reasons=?,
                ephemeral=?, last_judged_at=?, pinned=?
            WHERE id=?
            """,
            (
                fields["retain_tier"],
                fields["retain_score"],
                json.dumps(fields["retain_reasons"], ensure_ascii=False),
                1 if fields["ephemeral"] else 0,
                fields["last_judged_at"],
                1 if is_pinned else 0,
                cid,
            ),
        )
        conn.commit()
    return get_conversation(cid, include_messages=False)


def set_conversation_pinned(conversation_id: str, pinned: bool = True) -> dict[str, Any] | None:
    """Pin (durable) or unpin; re-scores immediately."""
    cid = (conversation_id or "").strip()
    if not cid:
        return None
    with _conn() as conn:
        row = conn.execute("SELECT id FROM conversations WHERE id=?", (cid,)).fetchone()
        if not row:
            return None
        conn.execute(
            "UPDATE conversations SET pinned=? WHERE id=?",
            (1 if pinned else 0, cid),
        )
        conn.commit()
    return apply_retain_score(cid, pinned=pinned)


def archive_conversation(conversation_id: str, *, archived: bool = True) -> bool:
    cid = (conversation_id or "").strip()
    if not cid:
        return False
    now = datetime.now(UTC).isoformat() if archived else None
    with _conn() as conn:
        cur = conn.execute(
            "UPDATE conversations SET archived_at=? WHERE id=?",
            (now, cid),
        )
        conn.commit()
        return cur.rowcount > 0


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
    memory_link_count: int = 0,
    retain_override: dict[str, Any] | None = None,
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
            "SELECT * FROM conversations WHERE id=?", (cid,)
        ).fetchone()
        created = existing["created_at"] if existing else (created_at or now)
        keys = _row_keys(existing) if existing else set()
        pinned = bool(int(existing["pinned"])) if existing and "pinned" in keys else False
        archived_at = existing["archived_at"] if existing and "archived_at" in keys else None

        if retain_override:
            retain = {
                "retain_tier": retain_override.get("retain_tier", "working"),
                "retain_score": float(retain_override.get("retain_score", 0.5)),
                "retain_reasons": list(retain_override.get("retain_reasons") or []),
                "ephemeral": bool(retain_override.get("ephemeral", False)),
                "last_judged_at": retain_override.get("last_judged_at")
                or datetime.now(UTC).isoformat(),
            }
        else:
            retain = _compute_retain(
                title.strip(),
                summary.strip(),
                action_items=action_items,
                messages=trimmed,
                memory_link_count=memory_link_count,
                pinned=pinned,
            )

        conn.execute(
            """
            INSERT INTO conversations
                (id, title, summary, category, emoji, messages_json,
                 action_items_json, created_at, updated_at,
                 retain_tier, retain_score, retain_reasons, ephemeral,
                 archived_at, last_judged_at, pinned)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET
                title=excluded.title,
                summary=excluded.summary,
                category=excluded.category,
                emoji=excluded.emoji,
                messages_json=excluded.messages_json,
                action_items_json=excluded.action_items_json,
                updated_at=excluded.updated_at,
                retain_tier=excluded.retain_tier,
                retain_score=excluded.retain_score,
                retain_reasons=excluded.retain_reasons,
                ephemeral=excluded.ephemeral,
                last_judged_at=excluded.last_judged_at
            """,
            (
                cid,
                title.strip(),
                summary.strip(),
                category,
                emoji,
                messages_json,
                action_items_json,
                created,
                now,
                retain["retain_tier"],
                retain["retain_score"],
                json.dumps(retain["retain_reasons"], ensure_ascii=False),
                1 if retain["ephemeral"] else 0,
                archived_at,
                retain["last_judged_at"],
                1 if pinned else 0,
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
        if not row:
            return None
        row = _maybe_backfill_row(conn, row)
    return _row_to_dict(row, include_messages=include_messages)


def list_conversations(
    limit: int = 100,
    *,
    map_eligible: bool = False,
    include_low_value: bool = False,
) -> list[dict[str, Any]]:
    from signal_quality.retain_policy import conversation_map_eligible

    with _conn() as conn:
        # Fetch extra when filtering for map so cap still fills.
        fetch_limit = max(1, limit * 4 if map_eligible else limit)
        rows = conn.execute(
            "SELECT * FROM conversations ORDER BY updated_at DESC LIMIT ?",
            (fetch_limit,),
        ).fetchall()
        out: list[dict[str, Any]] = []
        for r in rows:
            r = _maybe_backfill_row(conn, r)
            d = _row_to_dict(r)
            if map_eligible and not conversation_map_eligible(
                d, include_low_value=include_low_value
            ):
                continue
            out.append(d)
            if len(out) >= limit:
                break
    if map_eligible:
        out.sort(
            key=lambda d: (
                float(d.get("retain_score") or 0),
                str(d.get("updated_at") or ""),
            ),
            reverse=True,
        )
    return out


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


def list_conversation_cleanup_candidates(
    *,
    working_days: int | None = None,
    l0_min_age_days: int = 7,
) -> dict[str, list[dict[str, Any]]]:
    """Candidates for hard-delete (L0) and archive (cold working)."""
    from datetime import timedelta

    from signal_quality.retain_policy import working_days_threshold

    days = working_days if working_days is not None else working_days_threshold()
    now = datetime.now(UTC)
    archive_cutoff = (now - timedelta(days=days)).isoformat()
    l0_cutoff = (now - timedelta(days=l0_min_age_days)).isoformat()

    delete_ids: list[dict[str, Any]] = []
    archive_ids: list[dict[str, Any]] = []

    with _conn() as conn:
        rows = conn.execute("SELECT * FROM conversations").fetchall()
        for r in rows:
            r = _maybe_backfill_row(conn, r)
            d = _row_to_dict(r)
            if d.get("pinned"):
                continue
            updated = str(d.get("updated_at") or "")
            tier = str(d.get("retain_tier") or "")
            score = float(d.get("retain_score") or 0)
            ephemeral = bool(d.get("ephemeral"))
            reasons = d.get("retain_reasons") or []
            l0_reasons = {"voice_check", "agent_retry", "capability_faq", "untitled", "empty", "too_short"}
            is_l0 = ephemeral and score < 0.2 and (
                tier == "forget" or bool(set(reasons) & l0_reasons)
            )
            if is_l0 and updated < l0_cutoff:
                delete_ids.append({"id": d["id"], "title": d["title"], "reason": "l0_noise"})
                continue
            if d.get("archived_at"):
                continue
            if tier == "archive" or (
                tier == "working"
                and score < 0.7
                and updated < archive_cutoff
                and "memory_links" not in reasons
                and "action_items" not in reasons
            ):
                archive_ids.append({"id": d["id"], "title": d["title"], "reason": "cold_or_archive"})
    return {"delete": delete_ids, "archive": archive_ids}


def cleanup_conversations(
    *,
    dry_run: bool = True,
    delete: bool = True,
    working_days: int | None = None,
) -> dict[str, Any]:
    """Hard-delete L0 noise and archive cold/low-value chats."""
    candidates = list_conversation_cleanup_candidates(working_days=working_days)
    delete_list = candidates["delete"]
    archive_list = candidates["archive"]
    if dry_run:
        return {
            "ok": True,
            "candidates_delete": len(delete_list),
            "candidates_archive": len(archive_list),
            "delete_ids": [c["id"] for c in delete_list[:50]],
            "archive_ids": [c["id"] for c in archive_list[:50]],
        }
    deleted = 0
    archived = 0
    with _conn() as conn:
        if delete:
            for c in delete_list:
                cur = conn.execute("DELETE FROM conversations WHERE id=?", (c["id"],))
                deleted += cur.rowcount
        now = datetime.now(UTC).isoformat()
        for c in archive_list:
            cur = conn.execute(
                "UPDATE conversations SET archived_at=? WHERE id=? AND archived_at IS NULL",
                (now, c["id"]),
            )
            archived += cur.rowcount
        conn.commit()
    return {
        "ok": True,
        "candidates_delete": len(delete_list),
        "candidates_archive": len(archive_list),
        "deleted": deleted,
        "archived": archived,
    }


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
