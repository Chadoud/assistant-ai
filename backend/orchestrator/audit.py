"""Audit trail — an append-only record of every autonomous action.

Once the agent acts on its own, "what did it do and why" must be answerable after
the fact. Every tool call the loop dispatches is written here with its risk tier,
a truncated argument summary, and the outcome, so the user (or a dashboard) can review.
"""

from __future__ import annotations

import json
import logging
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from assistant_memory import memory_db_path

logger = logging.getLogger(__name__)

_MAX_ROWS = 2000

# Keys whose values must never appear in audit summaries (case-insensitive substring match).
_SECRET_ARG_KEYS = frozenset(
    {
        "api_key",
        "apikey",
        "token",
        "access_token",
        "refresh_token",
        "password",
        "secret",
        "authorization",
        "credential",
        "private_key",
    }
)
_REDACTED = "[REDACTED]"

_DDL = """
CREATE TABLE IF NOT EXISTS audit_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ts         TEXT    NOT NULL,
    goal       TEXT    NOT NULL DEFAULT '',
    action     TEXT    NOT NULL,
    risk       TEXT    NOT NULL DEFAULT '',
    args       TEXT    NOT NULL DEFAULT '',
    outcome    TEXT    NOT NULL DEFAULT '',
    detail     TEXT    NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log (ts);
"""


@dataclass
class AuditEntry:
    id: int
    ts: str
    goal: str
    action: str
    risk: str
    args: str
    outcome: str
    detail: str


def _connect() -> sqlite3.Connection:
    path: Path = memory_db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.executescript(_DDL)
    conn.commit()
    return conn


def _looks_like_secret_key(key: str) -> bool:
    lowered = key.lower().replace("-", "_")
    return any(part in lowered for part in _SECRET_ARG_KEYS)


def _redact_value(value: object) -> object:
    if isinstance(value, dict):
        return {
            k: _REDACTED if _looks_like_secret_key(str(k)) else _redact_value(v)
            for k, v in value.items()
        }
    if isinstance(value, list):
        return [_redact_value(item) for item in value]
    if isinstance(value, str) and len(value) > 8:
        # Heuristic: long base64-ish or bearer tokens without a named key.
        if value.startswith("Bearer ") or value.startswith("sk-") or value.startswith("AIza"):
            return _REDACTED
    return value


def _summarize_args(args: dict | None) -> str:
    if not args:
        return ""
    try:
        safe = _redact_value(args)
        return json.dumps(safe, ensure_ascii=False, default=str)[:500]
    except Exception:
        return str(args)[:500]


def record_action(
    action: str,
    *,
    goal: str = "",
    risk: str = "",
    args: dict | None = None,
    outcome: str = "",
    detail: str = "",
) -> None:
    """Append one action to the audit log (best-effort; never raises)."""
    now = datetime.now(UTC).isoformat()
    try:
        conn = _connect()
        try:
            conn.execute(
                "INSERT INTO audit_log (ts, goal, action, risk, args, outcome, detail) "
                "VALUES (?,?,?,?,?,?,?)",
                (now, goal[:300], action[:120], risk, _summarize_args(args),
                 outcome[:120], detail[:1000]),
            )
            conn.execute(
                """DELETE FROM audit_log WHERE id IN (
                       SELECT id FROM audit_log ORDER BY ts DESC LIMIT -1 OFFSET ?
                   )""",
                (_MAX_ROWS,),
            )
            conn.commit()
        finally:
            conn.close()
    except Exception:
        logger.exception("audit record failed")


def recent_actions(limit: int = 50) -> list[AuditEntry]:
    """Return the most recent audit entries, newest first."""
    try:
        conn = _connect()
        try:
            rows = conn.execute(
                "SELECT * FROM audit_log ORDER BY ts DESC, id DESC LIMIT ?", (limit,)
            ).fetchall()
            return [
                AuditEntry(
                    id=int(r["id"]), ts=str(r["ts"]), goal=str(r["goal"]),
                    action=str(r["action"]), risk=str(r["risk"]), args=str(r["args"]),
                    outcome=str(r["outcome"]), detail=str(r["detail"]),
                )
                for r in rows
            ]
        finally:
            conn.close()
    except Exception:
        logger.exception("audit read failed")
        return []


def clear_all() -> None:
    """Wipe the audit log (tests and an explicit user reset)."""
    try:
        conn = _connect()
        try:
            conn.execute("DELETE FROM audit_log")
            conn.commit()
        finally:
            conn.close()
    except Exception:
        logger.exception("audit clear failed")


class AuditAdapter:
    """Audit surface the agent loop depends on (swappable sink)."""

    def __init__(self, goal: str = "") -> None:
        self._goal = goal

    def record(self, action: str, *, risk: str = "", args: dict | None = None,
               outcome: str = "", detail: str = "") -> None:
        record_action(action, goal=self._goal, risk=risk, args=args,
                      outcome=outcome, detail=detail)


def default_adapter(goal: str = "") -> AuditAdapter:
    return AuditAdapter(goal)
