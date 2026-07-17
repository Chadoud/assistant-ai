"""Unified cleanup for promotional noise, stale auto-memories, and low-value chats."""

from __future__ import annotations

from typing import Any

import conversation_store
import tasks_store
from assistant_memory import cleanup_noise_memories, cleanup_stale_memories


def cleanup_second_brain_noise(
    *,
    dry_run: bool = False,
    delete: bool = True,
    include_stale: bool = False,
    include_conversations: bool = False,
) -> dict[str, Any]:
    """Remove promotional auto-memories, optional stale rows, mail tasks, and chats."""
    memory_noise = cleanup_noise_memories(dry_run=dry_run, delete=delete)
    memory_stale = (
        cleanup_stale_memories(dry_run=dry_run, delete=delete)
        if include_stale
        else {"ok": True, "candidates": 0, "skipped": "not_requested"}
    )
    task_result = tasks_store.cleanup_noise_tasks(dry_run=dry_run)
    conversations = (
        conversation_store.cleanup_conversations(dry_run=dry_run, delete=delete)
        if include_conversations
        else {
            "ok": True,
            "candidates_delete": 0,
            "candidates_archive": 0,
            "skipped": "not_requested",
        }
    )

    noise_removed = memory_noise.get("removed") or 0
    stale_removed = memory_stale.get("removed") or 0
    noise_candidates = memory_noise.get("candidates") or 0
    stale_candidates = memory_stale.get("candidates") or 0
    conv_deleted = conversations.get("deleted") or 0
    conv_archived = conversations.get("archived") or 0
    conv_del_cand = conversations.get("candidates_delete") or 0
    conv_arch_cand = conversations.get("candidates_archive") or 0

    return {
        "ok": True,
        "dry_run": dry_run,
        "include_stale": include_stale,
        "include_conversations": include_conversations,
        "memories": memory_noise,
        "memories_stale": memory_stale,
        "tasks": task_result,
        "conversations": conversations,
        "total_removed": (
            noise_removed
            + stale_removed
            + (task_result.get("removed") or 0)
            + conv_deleted
            + conv_archived
        ),
        "total_candidates": (
            noise_candidates
            + stale_candidates
            + (task_result.get("candidates") or 0)
            + conv_del_cand
            + conv_arch_cand
        ),
    }
