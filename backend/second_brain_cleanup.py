"""Unified cleanup for promotional noise and stale auto-memories across memories and tasks."""

from __future__ import annotations

from typing import Any

import tasks_store
from assistant_memory import cleanup_noise_memories, cleanup_stale_memories


def cleanup_second_brain_noise(
    *,
    dry_run: bool = False,
    delete: bool = True,
    include_stale: bool = False,
) -> dict[str, Any]:
    """Remove promotional auto-memories, optional stale auto-memories, and mail tasks."""
    memory_noise = cleanup_noise_memories(dry_run=dry_run, delete=delete)
    memory_stale = (
        cleanup_stale_memories(dry_run=dry_run, delete=delete)
        if include_stale
        else {"ok": True, "candidates": 0, "skipped": "not_requested"}
    )
    task_result = tasks_store.cleanup_noise_tasks(dry_run=dry_run)
    noise_removed = memory_noise.get("removed") or 0
    stale_removed = memory_stale.get("removed") or 0
    noise_candidates = memory_noise.get("candidates") or 0
    stale_candidates = memory_stale.get("candidates") or 0
    return {
        "ok": True,
        "dry_run": dry_run,
        "include_stale": include_stale,
        "memories": memory_noise,
        "memories_stale": memory_stale,
        "tasks": task_result,
        "total_removed": noise_removed + stale_removed + (task_result.get("removed") or 0),
        "total_candidates": noise_candidates + stale_candidates + (task_result.get("candidates") or 0),
    }
