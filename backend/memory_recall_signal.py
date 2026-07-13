"""Recall signal ranking helpers (Cognee-inspired usage tracking).

Pure logic + feature flag — DB writes live in ``assistant_memory``.
See ``docs/MEMORY_RECALL_SIGNAL.md``.
"""

from __future__ import annotations

import os
from datetime import UTC, datetime
from typing import Any

# Lexical score must exceed this to count as a recall touch from search.
RECALL_TOUCH_MIN_SCORE = 0.12

RECALL_WEIGHT_MAX = 2.0
RECALL_WEIGHT_REVIEW_BUMP = 0.25

# Ranking blend: S_lex = L * (0.70 + 0.15*R + 0.15*C)
RECALL_RANK_BASE = 0.70
RECALL_RANK_WEIGHT_SHARE = 0.15
RECALL_RANK_RECENCY_SHARE = 0.15

DEFAULT_STALE_DAYS = 90


def is_recall_signal_enabled() -> bool:
    return os.environ.get("EXOSITES_MEMORY_RECALL_SIGNAL", "").strip() == "1"


def stale_days_threshold() -> int:
    raw = os.environ.get("EXOSITES_MEMORY_STALE_DAYS", "").strip()
    if not raw:
        return DEFAULT_STALE_DAYS
    try:
        return max(1, int(raw))
    except ValueError:
        return DEFAULT_STALE_DAYS


def _parse_iso(ts: str | None) -> datetime | None:
    if not ts:
        return None
    try:
        normalized = str(ts).replace("Z", "+00:00")
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def recency_factor(last_recalled_at: str | None) -> float:
    """Recency boost in [0, 1] from last recall timestamp."""
    dt = _parse_iso(last_recalled_at)
    if dt is None:
        return 0.0
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    age_days = (datetime.now(UTC) - dt).total_seconds() / 86400.0
    if age_days <= 7:
        return 1.0
    if age_days <= 30:
        return 0.6
    if age_days <= 90:
        return 0.3
    return 0.0


def recall_weight_factor(recall_weight: float | None) -> float:
    rw = float(recall_weight or 1.0)
    return min(max(rw, 0.0), RECALL_WEIGHT_MAX) / RECALL_WEIGHT_MAX


def apply_recall_signal_to_lexical(lexical: float, entry: dict[str, Any]) -> float:
    """Blend lexical score with recall_weight and recency when flag is on."""
    if not is_recall_signal_enabled():
        return lexical
    r_factor = recall_weight_factor(entry.get("recall_weight"))
    c_factor = recency_factor(entry.get("last_recalled_at"))
    multiplier = (
        RECALL_RANK_BASE
        + RECALL_RANK_WEIGHT_SHARE * r_factor
        + RECALL_RANK_RECENCY_SHARE * c_factor
    )
    return lexical * multiplier


def eviction_priority(entry: dict[str, Any]) -> float:
    """Higher = more eligible for auto eviction (noise, low trust, staleness)."""
    noise = float(entry.get("noise_score") or 0)
    r_factor = recall_weight_factor(entry.get("recall_weight"))
    updated = _parse_iso(str(entry.get("updated_at") or ""))
    if updated and updated.tzinfo is None:
        updated = updated.replace(tzinfo=UTC)
    staleness_days = 0.0
    if updated:
        staleness_days = max(0.0, (datetime.now(UTC) - updated).total_seconds() / 86400.0)
    return noise * 2.0 + (1.0 - r_factor) + staleness_days / 365.0


def bump_recall_weight_sql() -> str:
    """SQL expression clamping recall_weight + bump to RECALL_WEIGHT_MAX."""
    bump = RECALL_WEIGHT_REVIEW_BUMP
    cap = RECALL_WEIGHT_MAX
    return (
        f"CASE WHEN recall_weight + {bump} > {cap} THEN {cap} "
        f"ELSE recall_weight + {bump} END"
    )
