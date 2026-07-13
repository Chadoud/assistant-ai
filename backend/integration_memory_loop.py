"""
Link sorted files to memory entries when integration harvest creates tasks.

Sort moat: integration → sort → memory loop (Phase 5).

Mail-derived tasks no longer auto-create memories — only calendar prep tasks do.
"""

from __future__ import annotations

import logging
from typing import Any

from origin_refs import origin_from_task
from signal_quality import PROVENANCE_CALENDAR, SignalTier, evaluate_memory_item

logger = logging.getLogger(__name__)

_MAIL_SOURCES = frozenset({"gmail", "outlook"})


def maybe_remember_from_task(task: dict[str, Any]) -> int:
    """When a task came from calendar prep, store a lightweight memory if new."""
    source = str(task.get("source") or "").replace("-", "_")
    if source in _MAIL_SOURCES:
        return 0
    if source not in {"google_calendar", "outlook_calendar", "integration"}:
        return 0
    desc = str(task.get("description") or "").strip()
    if len(desc) < 8:
        return 0
    key = f"Commitment: {desc[:48]}"
    verdict = evaluate_memory_item(key, desc, provenance=PROVENANCE_CALENDAR)
    if verdict.tier == SignalTier.REJECT:
        return 0
    origin_fields = origin_from_task(task)
    try:
        import assistant_memory

        if assistant_memory.memory_key_exists("context", key):
            return 0
        assistant_memory.update_memory(
            "context",
            key,
            desc[:500],
            conversation_id=None,
            source="auto",
            reviewed=False,
            provenance=PROVENANCE_CALENDAR,
            noise_score=verdict.score,
            origin_kind=origin_fields.get("origin_kind") or None,
            origin_ref=origin_fields.get("origin_ref"),
            origin_url=origin_fields.get("origin_url"),
            origin_label=origin_fields.get("origin_label"),
            linked_task_id=origin_fields.get("linked_task_id"),
        )
        return 1
    except ValueError:
        return 0
    except Exception:
        logger.exception("integration memory loop failed")
        return 0
