"""
Unified second-brain recall search across memories, conversations, activity, tasks, meetings.
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

_SOURCE_MEMORY = "memory"
_SOURCE_CONVERSATION = "conversation"
_SOURCE_ACTIVITY = "activity"
_SOURCE_TASK = "task"
_SOURCE_MEETING = "meeting"


def _task_hits(query: str, limit: int) -> list[dict[str, Any]]:
    import tasks_store
    from signal_quality import SignalTier, evaluate_text

    q = (query or "").strip().lower()
    tasks = tasks_store.list_tasks(include_completed=False)
    hits: list[dict[str, Any]] = []
    for task in tasks:
        desc = str(task.get("description", ""))
        if evaluate_text(desc).tier == SignalTier.REJECT:
            continue
        hay = desc.lower()
        if not q or q in hay:
            score = 1.0 if q and q in hay else 0.5
            hits.append(
                {
                    "source": _SOURCE_TASK,
                    "id": str(task["id"]),
                    "title": task["description"][:120],
                    "snippet": task["description"][:240],
                    "score": score,
                    "meta": {"due_at": task.get("due_at"), "priority": task.get("priority")},
                }
            )
    hits.sort(key=lambda h: h["score"], reverse=True)
    return hits[:limit]


def unified_search(query: str, *, limit: int = 20) -> list[dict[str, Any]]:
    """
    Aggregate recall hits from all second-brain sources.

    Returns a flat list sorted by score descending.
    """
    q = (query or "").strip()
    per_source = max(3, limit // 4)
    results: list[dict[str, Any]] = []

    try:
        from memory_search import search_memories

        for row in search_memories(q, limit=per_source):
            results.append(
                {
                    "source": _SOURCE_MEMORY,
                    "id": str(row.get("id") or row.get("key") or ""),
                    "title": f"{row.get('category', '')}: {row.get('key', '')}".strip(": "),
                    "snippet": str(row.get("value") or "")[:240],
                    "score": float(row.get("score") or 0.0),
                    "meta": {"category": row.get("category"), "reviewed": row.get("reviewed")},
                }
            )
    except Exception:
        logger.exception("unified_search memories failed")

    try:
        from conversation_store import search_conversations

        for row in search_conversations(q, limit=per_source):
            cat = row.get("category") or ""
            source = _SOURCE_MEETING if cat == "meeting" else _SOURCE_CONVERSATION
            results.append(
                {
                    "source": source,
                    "id": str(row.get("id") or ""),
                    "title": str(row.get("title") or "Conversation"),
                    "snippet": str(row.get("summary") or "")[:240],
                    "score": float(row.get("score") or 0.0),
                    "meta": {"category": cat, "updated_at": row.get("updated_at")},
                }
            )
    except Exception:
        logger.exception("unified_search conversations failed")

    try:
        from actions.recall_tools import search_activity

        act = search_activity({"query": q, "limit": per_source})
        if act.get("ok"):
            for row in act.get("data", {}).get("activity") or []:
                title = f"{row.get('app', '')} — {row.get('title', '')}".strip(" —")
                results.append(
                    {
                        "source": _SOURCE_ACTIVITY,
                        "id": f"{row.get('captured_at', '')}:{title[:40]}",
                        "title": title[:120],
                        "snippet": str(row.get("summary") or "")[:240],
                        "score": 0.6 if q else 0.4,
                        "meta": {"captured_at": row.get("captured_at")},
                    }
                )
    except Exception:
        logger.exception("unified_search activity failed")

    results.extend(_task_hits(q, per_source))
    results.sort(key=lambda r: r["score"], reverse=True)
    return results[: max(1, min(limit, 50))]
