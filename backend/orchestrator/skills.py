"""Procedural skill library — the learning loop.

When the agent completes a goal successfully, the proven step sequence is cached
as a *skill* keyed by the goal's token signature. Facing a similar goal later, the
agent recalls the best-matching skill and hands it to the planner as a strong prior
instead of planning from scratch — turning one-off successes into reusable procedure.

Matching is deterministic **Jaccard overlap** of goal tokens (offline, testable).
Like episodic memory, the ``SkillAdapter`` is the seam for a smarter (embedding-based)
matcher later without touching the loop.
"""

from __future__ import annotations

import json
import logging
import sqlite3
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path

from assistant_memory import memory_db_path

from .blackboard import Step, parse_plan
from .memory import _tokenize

logger = logging.getLogger(__name__)

# Minimum goal-token overlap (Jaccard) for a cached skill to be considered a match.
_MATCH_THRESHOLD = 0.34
_MAX_SKILLS = 200

_DDL = """
CREATE TABLE IF NOT EXISTS skills (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    signature  TEXT    NOT NULL UNIQUE,
    goal       TEXT    NOT NULL,
    plan       TEXT    NOT NULL,
    uses       INTEGER NOT NULL DEFAULT 0,
    successes  INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL,
    updated_at TEXT    NOT NULL
);
"""


@dataclass
class Skill:
    """A cached, proven plan for a class of goals."""

    id: int
    goal: str
    signature: list[str]
    plan: list[dict]
    uses: int
    successes: int


def _connect() -> sqlite3.Connection:
    path: Path = memory_db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.executescript(_DDL)
    conn.commit()
    return conn


def _signature(goal: str) -> list[str]:
    """Stable, order-independent token signature for a goal."""
    return sorted(set(_tokenize(goal)))


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _row_to_skill(row: sqlite3.Row) -> Skill:
    return Skill(
        id=int(row["id"]),
        goal=str(row["goal"]),
        signature=str(row["signature"]).split(),
        plan=json.loads(str(row["plan"])),
        uses=int(row["uses"]),
        successes=int(row["successes"]),
    )


def save_skill(goal: str, plan_steps: list[Step], *, success: bool) -> None:
    """Cache (or reinforce) a proven plan for ``goal``. No-op unless successful."""
    signature_tokens = _signature(goal)
    if not success or not plan_steps or not signature_tokens:
        return
    signature = " ".join(signature_tokens)
    plan_json = json.dumps([asdict(step) for step in plan_steps], ensure_ascii=False)
    now = datetime.now(UTC).isoformat()
    try:
        conn = _connect()
        try:
            conn.execute(
                """INSERT INTO skills (signature, goal, plan, uses, successes, created_at, updated_at)
                       VALUES (?, ?, ?, 1, 1, ?, ?)
                   ON CONFLICT (signature) DO UPDATE SET
                       plan=excluded.plan,
                       uses=skills.uses + 1,
                       successes=skills.successes + 1,
                       updated_at=excluded.updated_at""",
                (signature, goal.strip(), plan_json, now, now),
            )
            conn.execute(
                """DELETE FROM skills WHERE id IN (
                       SELECT id FROM skills ORDER BY updated_at DESC LIMIT -1 OFFSET ?
                   )""",
                (_MAX_SKILLS,),
            )
            conn.commit()
        finally:
            conn.close()
    except Exception:
        logger.exception("save_skill failed")


def find_skill(goal: str, *, threshold: float = _MATCH_THRESHOLD) -> Skill | None:
    """Return the proven skill whose goal best matches ``goal`` above ``threshold``."""
    query_tokens = set(_tokenize(goal))
    if not query_tokens:
        return None
    try:
        conn = _connect()
        try:
            rows = conn.execute(
                "SELECT * FROM skills WHERE successes > 0"
            ).fetchall()
        finally:
            conn.close()
    except Exception:
        logger.exception("find_skill failed")
        return None

    best: tuple[float, sqlite3.Row] | None = None
    for row in rows:
        score = _jaccard(query_tokens, set(str(row["signature"]).split()))
        if score >= threshold and (best is None or score > best[0]):
            best = (score, row)
    return _row_to_skill(best[1]) if best else None


def clear_all() -> None:
    """Wipe the skill library (tests and a user 'forget how-to' reset)."""
    try:
        conn = _connect()
        try:
            conn.execute("DELETE FROM skills")
            conn.commit()
        finally:
            conn.close()
    except Exception:
        logger.exception("skills clear failed")


class SkillAdapter:
    """recall/learn surface the agent loop depends on (swappable matcher)."""

    def recall_plan(self, goal: str) -> list[Step] | None:
        skill = find_skill(goal)
        if skill is None:
            return None
        steps = parse_plan(skill.plan)
        return steps or None

    def learn(self, goal: str, plan_steps: list[Step], success: bool) -> None:
        save_skill(goal, plan_steps, success=success)


def default_adapter() -> SkillAdapter:
    return SkillAdapter()
