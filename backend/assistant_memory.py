"""
Persistent assistant memory backed by SQLite.

Stores user preferences, context, project notes, and identity information so
the AI can remember details across sessions.  Ported and adapted from
Mark-XXXIX/memory/memory_manager.py — replaced the flat JSON store with the
same SQLite database already in use for telemetry.
"""

from __future__ import annotations

import logging
import os
import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, Generator

logger = logging.getLogger(__name__)

# ── Categories (mirrors Mark-XXXIX) ─────────────────────────────────────────

MEMORY_CATEGORIES = frozenset(
    {"identity", "preferences", "projects", "context", "notes", "relationships", "wishes"}
)

# ── Size limits ───────────────────────────────────────────────────────────────

# Maximum number of global (non-conversation-scoped) entries. Oldest by
# updated_at are evicted automatically when the store exceeds this limit.
# Raised from 200 to give the "second brain" Memories tab room to accumulate
# auto-extracted facts; manual entries are never silently evicted (see
# _evict_if_over_limit, which preserves manual rows).
MAX_GLOBAL_ENTRIES = 2000
# Per-conversation scoped entries are less critical; cap them more tightly.
MAX_SCOPED_ENTRIES_PER_CONVERSATION = 50
# Maximum characters for the memory block injected into any prompt. Entries
# are newest-first so the most relevant context fits within the cap.
_PROMPT_MAX_CHARS = 2000
# Per-value cap on stored facts — prevents one row from dominating the prompt
# budget (pattern from Mark-XXXIX memory_manager).
MAX_MEMORY_VALUE_CHARS = 500

# Per-category line limits when building the prompt block (Mark-XXXIX style).
_PROMPT_CATEGORY_LIMITS: dict[str, int] = {
    "identity": 12,
    "preferences": 15,
    "projects": 8,
    "context": 8,
    "relationships": 10,
    "wishes": 8,
    "notes": 8,
}
_IDENTITY_PRIORITY_FIELDS = (
    "name", "age", "birthday", "city", "job", "language", "school", "nationality",
)

_MEMORY_ROW_SELECT = (
    "id, category, key, value, conversation_id, updated_at, "
    "source, reviewed, provenance, noise_score, archived_at, "
    "origin_kind, origin_ref, origin_url, origin_label, linked_task_id, "
    "last_recalled_at, recall_weight"
)

# ── Database path ─────────────────────────────────────────────────────────────

def _db_path() -> Path:
    """Return the path to the memory SQLite database, next to the telemetry db."""
    base = os.environ.get("EXOSITES_DATA_DIR", "")
    if base:
        return Path(base) / "memory.sqlite"
    # Fall back to the telemetry data folder so all persistent data stays together.
    return Path(__file__).parent / "telemetry" / "data" / "memory.sqlite"


def memory_db_path() -> Path:
    """Public accessor for the shared memory database path.

    Lets sibling stores (e.g. the orchestrator's episodic memory) keep all
    persistent memory in the same SQLite file without duplicating path logic.
    """
    return _db_path()


# ── Schema bootstrap ──────────────────────────────────────────────────────────

_DDL = """
CREATE TABLE IF NOT EXISTS memory_entries (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    category   TEXT    NOT NULL,
    key        TEXT    NOT NULL,
    value      TEXT    NOT NULL DEFAULT '',
    updated_at TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memory_category ON memory_entries (category);
"""


def _migrate_schema(conn: sqlite3.Connection) -> None:
    """
    Ensure the schema is up to date.

    Version 1 → 2: adds conversation_id column + scoped unique index.
    Uses a full table recreation because SQLite cannot drop inline constraints
    via ALTER TABLE, and the v1 UNIQUE(category, key) would block scoped entries
    that share the same key.  Preserves all existing rows.

    Version 2 → 3: adds `source` ('manual'|'auto') and `reviewed` (0|1) columns
    so auto-extracted memories can be flagged for user review (Omi-style),
    distinct from facts the user typed themselves.

    Version 3 → 4: adds provenance, noise_score, archived_at for signal-quality
    filtering and bulk cleanup of promotional content.
    """
    info = conn.execute("PRAGMA table_info(memory_entries)").fetchall()
    existing_cols = {r["name"] for r in info}
    if "conversation_id" not in existing_cols:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS _mem_migrate (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                category        TEXT    NOT NULL,
                key             TEXT    NOT NULL,
                value           TEXT    NOT NULL DEFAULT '',
                updated_at      TEXT    NOT NULL,
                conversation_id TEXT    DEFAULT NULL
            );
            INSERT OR IGNORE INTO _mem_migrate (id, category, key, value, updated_at)
                SELECT id, category, key, value, updated_at FROM memory_entries;
            DROP TABLE memory_entries;
            ALTER TABLE _mem_migrate RENAME TO memory_entries;
            CREATE INDEX IF NOT EXISTS idx_memory_category
                ON memory_entries (category);
            CREATE INDEX IF NOT EXISTS idx_memory_conversation
                ON memory_entries (conversation_id);
            CREATE UNIQUE INDEX IF NOT EXISTS uq_memory_entries_scoped
                ON memory_entries (category, key, COALESCE(conversation_id, ''));
        """)
        conn.commit()
        existing_cols.add("conversation_id")

    if "source" not in existing_cols:
        # Existing rows predate auto-extraction → treat them as user-authored.
        conn.execute(
            "ALTER TABLE memory_entries ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'"
        )
        conn.execute(
            "ALTER TABLE memory_entries ADD COLUMN reviewed INTEGER NOT NULL DEFAULT 1"
        )
        conn.commit()
        existing_cols.add("source")
        existing_cols.add("reviewed")

    if "provenance" not in existing_cols:
        conn.execute("ALTER TABLE memory_entries ADD COLUMN provenance TEXT DEFAULT NULL")
        conn.execute(
            "ALTER TABLE memory_entries ADD COLUMN noise_score REAL NOT NULL DEFAULT 0"
        )
        conn.execute("ALTER TABLE memory_entries ADD COLUMN archived_at TEXT DEFAULT NULL")
        conn.commit()
        existing_cols.update({"provenance", "noise_score", "archived_at"})

    if "origin_kind" not in existing_cols:
        conn.execute("ALTER TABLE memory_entries ADD COLUMN origin_kind TEXT DEFAULT NULL")
        conn.execute("ALTER TABLE memory_entries ADD COLUMN origin_ref TEXT DEFAULT NULL")
        conn.execute("ALTER TABLE memory_entries ADD COLUMN origin_url TEXT DEFAULT NULL")
        conn.execute("ALTER TABLE memory_entries ADD COLUMN origin_label TEXT DEFAULT NULL")
        conn.execute("ALTER TABLE memory_entries ADD COLUMN linked_task_id INTEGER DEFAULT NULL")
        conn.commit()

    if "last_recalled_at" not in existing_cols:
        conn.execute("ALTER TABLE memory_entries ADD COLUMN last_recalled_at TEXT DEFAULT NULL")
        conn.execute(
            "ALTER TABLE memory_entries ADD COLUMN recall_weight REAL NOT NULL DEFAULT 1.0"
        )
        conn.commit()


def _connect() -> sqlite3.Connection:
    path = _db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.executescript(_DDL)
    conn.commit()
    _migrate_schema(conn)
    return conn


@contextmanager
def _conn() -> Generator[sqlite3.Connection, None, None]:
    """Open a connection, yield it, and always close it on exit.

    NOTE: sqlite3.Connection used as a context manager (`with conn:`) only
    handles transactions — it does NOT close the connection. This wrapper
    ensures the underlying file handle is released after every operation.
    """
    conn = _connect()
    try:
        yield conn
    finally:
        conn.close()


# ── Public API ────────────────────────────────────────────────────────────────

def load_memory(conversation_id: str | None = None) -> dict[str, dict[str, str]]:
    """
    Return memory as {category: {key: value}}.

    Always includes global entries (conversation_id IS NULL). When a
    conversation_id is supplied, conversation-scoped entries for that
    conversation are also merged in, with scoped values taking priority
    over global values for the same key.
    """
    result: dict[str, dict[str, str]] = {cat: {} for cat in MEMORY_CATEGORIES}
    from signal_quality import auto_memory_visibility_sql

    visibility_sql = auto_memory_visibility_sql()
    try:
        with _conn() as conn:
            if conversation_id:
                rows = conn.execute(
                    f"""
                    SELECT category, key, value, conversation_id
                    FROM memory_entries
                    WHERE (conversation_id IS NULL OR conversation_id = ?)
                      AND {visibility_sql}
                    ORDER BY updated_at DESC
                    """,
                    (conversation_id,),
                ).fetchall()
            else:
                rows = conn.execute(
                    f"SELECT category, key, value, conversation_id FROM memory_entries "
                    f"WHERE conversation_id IS NULL AND {visibility_sql} "
                    f"ORDER BY updated_at DESC"
                ).fetchall()
        # Process global entries first, then let scoped entries overwrite
        global_rows = [r for r in rows if r["conversation_id"] is None]
        scoped_rows = [r for r in rows if r["conversation_id"] is not None]
        for row in (*global_rows, *scoped_rows):
            cat = str(row["category"])
            if cat in result:
                result[cat][str(row["key"])] = str(row["value"])
    except Exception:
        logger.exception("Failed to load memory")
    return result


def _evict_if_over_limit(conn: sqlite3.Connection, conversation_id: str | None) -> None:
    """Delete auto entries when the store for a given scope exceeds its limit.

    When recall signal is enabled, evicts highest eviction-priority rows first
    (noisy, low recall_weight, stale) instead of pure oldest-updated_at.
    """
    from memory_recall_signal import eviction_priority, is_recall_signal_enabled

    limit = (
        MAX_GLOBAL_ENTRIES
        if conversation_id is None
        else MAX_SCOPED_ENTRIES_PER_CONVERSATION
    )
    if conversation_id is None:
        rows = conn.execute(
            f"SELECT {_MEMORY_ROW_SELECT} FROM memory_entries "
            "WHERE conversation_id IS NULL AND source='auto'"
        ).fetchall()
    else:
        rows = conn.execute(
            f"SELECT {_MEMORY_ROW_SELECT} FROM memory_entries "
            "WHERE conversation_id=? AND source='auto'",
            (conversation_id,),
        ).fetchall()
    overflow = len(rows) - limit
    if overflow <= 0:
        return
    if is_recall_signal_enabled():
        ranked = sorted(
            rows,
            key=lambda r: eviction_priority(_memory_row_dict(r)),
            reverse=True,
        )
        evict_ids = [int(r["id"]) for r in ranked[:overflow]]
    else:
        ranked = sorted(rows, key=lambda r: str(r["updated_at"]))
        evict_ids = [int(r["id"]) for r in ranked[:overflow]]
    placeholders = ",".join("?" * len(evict_ids))
    conn.execute(f"DELETE FROM memory_entries WHERE id IN ({placeholders})", evict_ids)
    logger.debug(
        "[memory] evicted %d auto entries (scope=%s, limit=%d)",
        overflow,
        "global" if conversation_id is None else conversation_id[:8],
        limit,
    )


def _truncate_memory_value(value: str) -> str:
    """Cap stored value length so prompt injection stays bounded."""
    v = (value or "").strip()
    if len(v) <= MAX_MEMORY_VALUE_CHARS:
        return v
    return v[:MAX_MEMORY_VALUE_CHARS].rstrip() + "…"


def _normalize_memory_key(key: str) -> str:
    return key.strip().lower().replace(" ", "_")


def _sort_identity_pairs(pairs: list[tuple[str, str]]) -> list[tuple[str, str]]:
    """Surface core identity fields first (name, job, city…) like Mark-XXXIX."""
    seen: set[str] = set()
    ordered: list[tuple[str, str]] = []
    by_norm = {_normalize_memory_key(k): (k, v) for k, v in pairs}
    for field in _IDENTITY_PRIORITY_FIELDS:
        hit = by_norm.get(field)
        if hit:
            ordered.append(hit)
            seen.add(hit[0])
    for k, v in pairs:
        if k not in seen:
            ordered.append((k, v))
    return ordered


def _cap_pairs_for_prompt(category: str, pairs: list[tuple[str, str]]) -> list[tuple[str, str]]:
    limit = _PROMPT_CATEGORY_LIMITS.get(category, 8)
    if category == "identity":
        pairs = _sort_identity_pairs(pairs)
    return pairs[:limit]


def _memory_row_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "category": str(row["category"]),
        "key": str(row["key"]),
        "value": str(row["value"]),
        "conversation_id": row["conversation_id"],
        "updated_at": str(row["updated_at"]),
        "source": str(row["source"]),
        "reviewed": bool(row["reviewed"]),
        "provenance": row["provenance"],
        "noise_score": float(row["noise_score"] or 0),
        "archived_at": row["archived_at"],
        "origin_kind": row["origin_kind"],
        "origin_ref": row["origin_ref"],
        "origin_url": row["origin_url"],
        "origin_label": row["origin_label"],
        "linked_task_id": int(row["linked_task_id"]) if row["linked_task_id"] is not None else None,
        "last_recalled_at": row["last_recalled_at"],
        "recall_weight": float(row["recall_weight"] if row["recall_weight"] is not None else 1.0),
    }


def touch_memory_recall(row_ids: list[int], *, source: str = "search") -> int:
    """Mark memories as recalled (batch). No-op when recall signal flag is off."""
    from memory_recall_signal import is_recall_signal_enabled

    if not is_recall_signal_enabled():
        return 0
    unique = list(dict.fromkeys(int(i) for i in row_ids if int(i) > 0))
    if not unique:
        return 0
    now = datetime.now(UTC).isoformat()
    placeholders = ",".join("?" * len(unique))
    try:
        with _conn() as conn:
            conn.execute(
                f"UPDATE memory_entries SET last_recalled_at=? WHERE id IN ({placeholders})",
                (now, *unique),
            )
            conn.commit()
        logger.info("[memory] recall touch source=%s count=%d", source, len(unique))
        return len(unique)
    except Exception:
        logger.exception("touch_memory_recall failed source=%s", source)
        return 0


def update_memory(
    category: str,
    key: str,
    value: str,
    conversation_id: str | None = None,
    source: str = "manual",
    reviewed: bool | None = None,
    provenance: str | None = None,
    noise_score: float | None = None,
    skip_signal_check: bool = False,
    origin_kind: str | None = None,
    origin_ref: str | None = None,
    origin_url: str | None = None,
    origin_label: str | None = None,
    linked_task_id: int | None = None,
) -> int:
    """
    Upsert a single memory entry and return its row id.

    When conversation_id is None the entry is global (visible in all
    conversations). When conversation_id is set the entry is scoped to
    that conversation and overlays the global value for the same key.

    `source` is 'manual' (user-authored) or 'auto' (LLM-extracted). Auto
    entries default to reviewed=False so the UI can surface them for triage.

    Raises ``ValueError`` when signal quality rejects the content (promotional/spam).
    """
    from signal_quality import SIGNAL_CHECK_BYPASS_KEYS, SignalTier, evaluate_memory_item

    if category not in MEMORY_CATEGORIES:
        raise ValueError(f"Unknown memory category: {category!r}")
    if source not in ("manual", "auto"):
        raise ValueError(f"Unknown memory source: {source!r}")

    bypass = skip_signal_check or key.strip() in SIGNAL_CHECK_BYPASS_KEYS
    if not bypass and source == "manual" and provenance is None:
        provenance = "manual"

    verdict = evaluate_memory_item(
        key,
        value,
        provenance=provenance,
        skip_check=bypass,
    )
    if verdict.tier == SignalTier.REJECT:
        raise ValueError(f"memory_rejected:{verdict.reason}")

    resolved_noise = noise_score if noise_score is not None else verdict.score
    if reviewed is None:
        reviewed = source == "manual"

    now = datetime.now(UTC).isoformat()
    trimmed_value = _truncate_memory_value(value)
    trimmed_key = key.strip()
    try:
        with _conn() as conn:
            cur = conn.execute(
                """
                INSERT INTO memory_entries
                    (category, key, value, updated_at, conversation_id, source, reviewed,
                     provenance, noise_score, archived_at,
                     origin_kind, origin_ref, origin_url, origin_label, linked_task_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)
                ON CONFLICT (category, key, COALESCE(conversation_id, ''))
                DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at,
                    source=excluded.source, reviewed=excluded.reviewed,
                    provenance=excluded.provenance, noise_score=excluded.noise_score,
                    origin_kind=COALESCE(excluded.origin_kind, memory_entries.origin_kind),
                    origin_ref=COALESCE(excluded.origin_ref, memory_entries.origin_ref),
                    origin_url=COALESCE(excluded.origin_url, memory_entries.origin_url),
                    origin_label=COALESCE(excluded.origin_label, memory_entries.origin_label),
                    linked_task_id=COALESCE(excluded.linked_task_id, memory_entries.linked_task_id)
                RETURNING id
                """,
                (
                    category,
                    trimmed_key,
                    trimmed_value,
                    now,
                    conversation_id,
                    source,
                    1 if reviewed else 0,
                    provenance,
                    float(resolved_noise),
                    origin_kind,
                    origin_ref,
                    origin_url,
                    origin_label,
                    linked_task_id,
                ),
            )
            row = cur.fetchone()
            row_id = int(row["id"]) if row else -1
            _evict_if_over_limit(conn, conversation_id)
            conn.commit()
            return row_id
    except Exception:
        logger.exception("Failed to update memory entry %s/%s", category, key)
        raise


def update_memory_by_id(row_id: int, value: str) -> bool:
    """Edit the value of an existing entry by id (used by PUT /memory/{id})."""
    from signal_quality import SIGNAL_CHECK_BYPASS_KEYS, SignalTier, evaluate_memory_item

    new_value = _truncate_memory_value(value)
    if not new_value:
        raise ValueError("memory_value_required")

    try:
        with _conn() as conn:
            row = conn.execute(
                "SELECT key, source, provenance FROM memory_entries WHERE id=?",
                (row_id,),
            ).fetchone()
            if not row:
                return False

            bypass = (
                str(row["key"]).strip() in SIGNAL_CHECK_BYPASS_KEYS
                or str(row["source"]) == "manual"
            )
            verdict = evaluate_memory_item(
                str(row["key"]),
                new_value,
                provenance=row["provenance"],
                skip_check=bypass,
            )
            if verdict.tier == SignalTier.REJECT:
                raise ValueError(f"memory_rejected:{verdict.reason}")

            now = datetime.now(UTC).isoformat()
            cur = conn.execute(
                "UPDATE memory_entries SET value=?, updated_at=?, noise_score=? WHERE id=?",
                (new_value, now, float(verdict.score), row_id),
            )
            conn.commit()
            return cur.rowcount > 0
    except ValueError:
        raise
    except Exception:
        logger.exception("Failed to update memory entry id=%s", row_id)
        raise


def set_memory_reviewed(row_id: int, reviewed: bool = True) -> bool:
    """Flip the reviewed flag on an auto-extracted entry (Omi-style triage)."""
    from memory_recall_signal import bump_recall_weight_sql

    try:
        with _conn() as conn:
            if reviewed:
                cur = conn.execute(
                    f"UPDATE memory_entries SET reviewed=1, "
                    f"recall_weight={bump_recall_weight_sql()} WHERE id=?",
                    (row_id,),
                )
            else:
                cur = conn.execute(
                    "UPDATE memory_entries SET reviewed=0 WHERE id=?",
                    (row_id,),
                )
            conn.commit()
            return cur.rowcount > 0
    except Exception:
        logger.exception("Failed to set reviewed flag for id=%s", row_id)
        raise


def delete_memory_by_id(row_id: int) -> bool:
    """Delete a single entry by its row id."""
    try:
        with _conn() as conn:
            cur = conn.execute("DELETE FROM memory_entries WHERE id=?", (row_id,))
            conn.commit()
            return cur.rowcount > 0
    except Exception:
        logger.exception("Failed to delete memory entry id=%s", row_id)
        raise


def _memory_entries_by_ids(row_ids: list[int]) -> list[dict[str, Any]]:
    """Load full row payloads for the given ids (for batch undo snapshots)."""
    if not row_ids:
        return []
    placeholders = ",".join("?" * len(row_ids))
    try:
        with _conn() as conn:
            rows = conn.execute(
                f"SELECT {_MEMORY_ROW_SELECT} FROM memory_entries WHERE id IN ({placeholders})",
                row_ids,
            ).fetchall()
        return [_memory_row_dict(r) for r in rows]
    except Exception:
        logger.exception("Failed to load memory entries by ids")
        raise


def batch_memory_action(row_ids: list[int], action: str) -> dict[str, Any]:
    """
    Apply review / unreview / delete to many rows in one transaction.

    For delete, returns snapshots of removed rows so the client can undo.
    """
    unique_ids = list(dict.fromkeys(int(i) for i in row_ids if int(i) > 0))
    if not unique_ids:
        return {"ok": True, "affected": 0, "ids": [], "snapshots": []}
    if action not in ("review", "unreview", "delete"):
        raise ValueError(f"unknown_batch_action:{action}")

    snapshots: list[dict[str, Any]] = []
    if action == "delete":
        snapshots = _memory_entries_by_ids(unique_ids)

    placeholders = ",".join("?" * len(unique_ids))
    from memory_recall_signal import bump_recall_weight_sql

    bump_sql = bump_recall_weight_sql()
    try:
        with _conn() as conn:
            if action == "review":
                conn.execute(
                    f"UPDATE memory_entries SET reviewed=1, "
                    f"recall_weight={bump_sql} WHERE id IN ({placeholders})",
                    unique_ids,
                )
            elif action == "unreview":
                conn.execute(
                    f"UPDATE memory_entries SET reviewed=0 WHERE id IN ({placeholders})",
                    unique_ids,
                )
            else:
                conn.execute(
                    f"DELETE FROM memory_entries WHERE id IN ({placeholders})",
                    unique_ids,
                )
            conn.commit()
    except Exception:
        logger.exception("batch_memory_action failed action=%s count=%s", action, len(unique_ids))
        raise

    return {
        "ok": True,
        "action": action,
        "affected": len(unique_ids),
        "ids": unique_ids,
        "snapshots": snapshots,
    }


def restore_memory_snapshots(snapshots: list[dict[str, Any]]) -> int:
    """Re-insert deleted memory rows (batch-delete undo). Skips signal re-check."""
    restored = 0
    for snap in snapshots:
        category = str(snap.get("category", ""))
        key = str(snap.get("key", ""))
        value = str(snap.get("value", ""))
        if not category or not key or not value:
            continue
        update_memory(
            category,
            key,
            value,
            snap.get("conversation_id"),
            source=str(snap.get("source") or "manual"),
            reviewed=bool(snap.get("reviewed")),
            provenance=snap.get("provenance"),
            noise_score=float(snap.get("noise_score") or 0),
            skip_signal_check=True,
            origin_kind=snap.get("origin_kind"),
            origin_ref=snap.get("origin_ref"),
            origin_url=snap.get("origin_url"),
            origin_label=snap.get("origin_label"),
            linked_task_id=snap.get("linked_task_id"),
        )
        restored += 1
    return restored


def memory_key_exists(category: str, key: str, conversation_id: str | None = None) -> bool:
    """Return True when an entry already exists for this (category, key, scope)."""
    try:
        with _conn() as conn:
            row = conn.execute(
                "SELECT 1 FROM memory_entries "
                "WHERE category=? AND key=? AND COALESCE(conversation_id,'')=COALESCE(?, '') "
                "LIMIT 1",
                (category, key.strip(), conversation_id),
            ).fetchone()
            return row is not None
    except Exception:
        logger.exception("Failed to check memory key existence %s/%s", category, key)
        return False


def clear_conversation_memory(conversation_id: str) -> None:
    """Delete all memory entries scoped to a specific conversation."""
    try:
        with _conn() as conn:
            conn.execute(
                "DELETE FROM memory_entries WHERE conversation_id = ?",
                (conversation_id,),
            )
            conn.commit()
    except Exception:
        logger.exception("Failed to clear memory for conversation %s", conversation_id)
        raise


def delete_memory(category: str, key: str, conversation_id: str | None = None) -> bool:
    """
    Delete a single entry.

    When conversation_id is None, only the global row (conversation_id IS NULL) is
    deleted — scoped overrides for the same key are left untouched.
    When conversation_id is provided, only that conversation's scoped row is removed.
    """
    try:
        with _conn() as conn:
            if conversation_id is None:
                cur = conn.execute(
                    "DELETE FROM memory_entries "
                    "WHERE category=? AND key=? AND conversation_id IS NULL",
                    (category, key),
                )
            else:
                cur = conn.execute(
                    "DELETE FROM memory_entries WHERE category=? AND key=? AND conversation_id=?",
                    (category, key, conversation_id),
                )
            conn.commit()
            return cur.rowcount > 0
    except Exception:
        logger.exception("Failed to delete memory entry %s/%s", category, key)
        return False


def clear_all_memory() -> None:
    """Wipe the entire memory store."""
    try:
        with _conn() as conn:
            conn.execute("DELETE FROM memory_entries")
            conn.commit()
    except Exception:
        logger.exception("Failed to clear memory")
        raise


def format_memory_for_prompt() -> str:
    """
    Return a compact, LLM-ready string of global memory, capped at _PROMPT_MAX_CHARS.

    Rows are fetched newest-first so that the most recently updated facts are
    always included when the total exceeds the cap.  Returns an empty string when
    no memory is saved so the prompt is not polluted.
    """
    try:
        with _conn() as conn:
            rows = conn.execute(
                f"SELECT {_MEMORY_ROW_SELECT} FROM memory_entries "
                "WHERE conversation_id IS NULL ORDER BY updated_at DESC"
            ).fetchall()
    except Exception:
        logger.exception("Failed to load memory for prompt")
        return ""

    from signal_quality import is_prompt_visible

    visible_rows = [r for r in rows if is_prompt_visible(dict(r))]
    if not visible_rows:
        return ""

    header = (
        "=== What you know about this person — use naturally, never recite like a list ==="
    )
    footer = "=== End of memory ==="
    # Budget: total cap minus the fixed header/footer/newlines
    budget = _PROMPT_MAX_CHARS - len(header) - len(footer) - 2

    # Group by category (preserve insertion order across row list)
    by_cat: dict[str, list[tuple[str, str, int]]] = {}
    for r in visible_rows:
        cat = str(r["category"])
        by_cat.setdefault(cat, []).append((str(r["key"]), str(r["value"]), int(r["id"])))

    lines: list[str] = []
    included_ids: list[int] = []
    truncated = False
    used = 0
    for cat in MEMORY_CATEGORIES:
        triples = by_cat.get(cat)
        if not triples:
            continue
        pairs = _cap_pairs_for_prompt(cat, [(k, v) for k, v, _ in triples])
        # Re-map capped pairs back to ids (first match per key)
        id_by_key = {k: i for k, _, i in triples}
        cat_line = f"[{cat.upper()}]"
        if used + len(cat_line) + 1 > budget:
            truncated = True
            break
        lines.append(cat_line)
        used += len(cat_line) + 1
        for k, v in pairs:
            entry = f"  {k}: {v}"
            if used + len(entry) + 1 > budget:
                truncated = True
                break
            lines.append(entry)
            used += len(entry) + 1
            row_id = id_by_key.get(k)
            if row_id is not None:
                included_ids.append(row_id)
        if truncated:
            break

    if not lines:
        return ""

    touch_memory_recall(included_ids, source="prompt")

    parts = [header, *lines]
    if truncated:
        parts.append("  ... (older entries omitted)")
    parts.append(footer)
    return "\n".join(parts)


def memory_as_dict(conversation_id: str | None = None) -> dict[str, Any]:
    """Return memory formatted for the /memory API endpoint."""
    return load_memory(conversation_id)


def list_all_memory_scoped() -> list[dict[str, Any]]:
    """
    Return every memory entry as a flat list, including conversation-scoped rows.

    Used by the Memories tab + Settings UI to show users what the AI knows across
    all contexts. Each dict has keys: id, category, key, value, conversation_id,
    updated_at, source, reviewed.
    """
    try:
        with _conn() as conn:
            rows = conn.execute(
                f"SELECT {_MEMORY_ROW_SELECT} FROM memory_entries "
                "ORDER BY conversation_id NULLS FIRST, updated_at DESC"
            ).fetchall()
        return [_memory_row_dict(r) for r in rows]
    except Exception:
        logger.exception("Failed to list all memory entries")
        return []


def update_memory_origin(row_id: int, fields: dict[str, Any]) -> bool:
    """Persist origin envelope fields on an existing memory row."""
    allowed = ("origin_kind", "origin_ref", "origin_url", "origin_label", "linked_task_id")
    updates = {k: fields[k] for k in allowed if k in fields and fields[k] is not None}
    if not updates:
        return False
    set_clause = ", ".join(f"{k}=?" for k in updates)
    try:
        with _conn() as conn:
            cur = conn.execute(
                f"UPDATE memory_entries SET {set_clause} WHERE id=?",
                (*updates.values(), row_id),
            )
            conn.commit()
            return cur.rowcount > 0
    except Exception:
        logger.exception("Failed to update memory origin id=%s", row_id)
        raise


def get_memory_entry_by_id(row_id: int) -> dict[str, Any] | None:
    """Load a single memory row by id."""
    try:
        with _conn() as conn:
            row = conn.execute(
                f"SELECT {_MEMORY_ROW_SELECT} FROM memory_entries WHERE id=?",
                (row_id,),
            ).fetchone()
        return _memory_row_dict(row) if row else None
    except Exception:
        logger.exception("Failed to load memory entry id=%s", row_id)
        return None


def cleanup_noise_memories(*, dry_run: bool = False, delete: bool = True) -> dict[str, Any]:
    """
    Scan global memory entries and remove/archive promotional noise.

    Returns counts and sample ids for the UI cleanup action.
    """
    from signal_quality import SignalTier, evaluate_memory_item

    entries = list_all_memory_scoped()
    candidates: list[int] = []
    for entry in entries:
        if entry.get("source") == "manual":
            continue
        verdict = evaluate_memory_item(
            str(entry.get("key", "")),
            str(entry.get("value", "")),
            provenance=entry.get("provenance"),
        )
        if verdict.tier == SignalTier.REJECT or (
            verdict.tier == SignalTier.QUARANTINE and not entry.get("reviewed")
        ):
            candidates.append(int(entry["id"]))

    if dry_run:
        return {"ok": True, "candidates": len(candidates), "ids": candidates[:50]}

    removed = 0
    now = datetime.now(UTC).isoformat()
    try:
        with _conn() as conn:
            for row_id in candidates:
                if delete:
                    cur = conn.execute("DELETE FROM memory_entries WHERE id=?", (row_id,))
                else:
                    cur = conn.execute(
                        "UPDATE memory_entries SET archived_at=?, noise_score=1.0 WHERE id=?",
                        (now, row_id),
                    )
                removed += cur.rowcount
            conn.commit()
    except Exception:
        logger.exception("cleanup_noise_memories failed")
        raise

    return {"ok": True, "candidates": len(candidates), "removed": removed, "deleted": delete}


def cleanup_stale_memories(*, dry_run: bool = False, delete: bool = True) -> dict[str, Any]:
    """
    Remove unreviewed auto memories that were never/recursively not recalled and are old or noisy.

    Manual and reviewed auto rows are never candidates. Complements ``cleanup_noise_memories``.
    """
    from memory_recall_signal import is_recall_signal_enabled, stale_days_threshold
    from signal_quality import AUTO_MEMORY_HIDDEN_NOISE_THRESHOLD

    if not is_recall_signal_enabled():
        return {"ok": True, "skipped": "flag_disabled", "candidates": 0, "ids": []}

    stale_days = stale_days_threshold()
    cutoff = datetime.now(UTC) - timedelta(days=stale_days)
    cutoff_iso = cutoff.isoformat()

    entries = list_all_memory_scoped()
    candidates: list[int] = []
    for entry in entries:
        if entry.get("source") == "manual":
            continue
        if entry.get("reviewed"):
            continue
        if entry.get("archived_at"):
            continue
        noise = float(entry.get("noise_score") or 0)
        last_recalled = entry.get("last_recalled_at")
        updated_at = str(entry.get("updated_at") or "")
        is_noisy = noise >= AUTO_MEMORY_HIDDEN_NOISE_THRESHOLD
        never_recalled_stale = last_recalled is None and updated_at < cutoff_iso
        recalled_stale = (
            last_recalled is not None
            and str(last_recalled) < cutoff_iso
        )
        if is_noisy or never_recalled_stale or recalled_stale:
            candidates.append(int(entry["id"]))

    if dry_run:
        return {"ok": True, "candidates": len(candidates), "ids": candidates[:50]}

    removed = 0
    try:
        with _conn() as conn:
            for row_id in candidates:
                if delete:
                    cur = conn.execute("DELETE FROM memory_entries WHERE id=?", (row_id,))
                else:
                    now = datetime.now(UTC).isoformat()
                    cur = conn.execute(
                        "UPDATE memory_entries SET archived_at=?, noise_score=1.0 WHERE id=?",
                        (now, row_id),
                    )
                removed += cur.rowcount
            conn.commit()
    except Exception:
        logger.exception("cleanup_stale_memories failed")
        raise

    logger.info(
        "[memory] stale cleanup removed=%d candidates=%d dry_run=%s",
        removed,
        len(candidates),
        dry_run,
    )
    return {
        "ok": True,
        "candidates": len(candidates),
        "removed": removed,
        "deleted": delete,
        "stale_days": stale_days,
    }
