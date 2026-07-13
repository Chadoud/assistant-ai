"""
Recall + task tools for the assistant catalog (voice Live API + text chat + agent).

These expose the second-brain knowledge stores to the model:
- ``search_memories``      — find facts the assistant has remembered about the user
- ``create_task`` / ``list_tasks`` / ``complete_task`` — manage action items
- ``search_conversations`` — find past conversations by topic/date

Every handler returns the catalog-standard ``{"ok": bool, "data"|"error": ...}``.
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


def search_memories(args: dict[str, Any]) -> dict[str, Any]:
    """Find remembered facts about the user, ranked by relevance to a query."""
    from memory_search import search_memories as _search

    query = str(args.get("query", "") or "").strip()
    limit = int(args.get("limit", 8) or 8)
    category = args.get("category")
    try:
        results = _search(query, limit=max(1, min(limit, 25)), category=category)
        return {
            "ok": True,
            "data": {
                "count": len(results),
                "memories": [
                    {
                        "category": r["category"],
                        "key": r["key"],
                        "value": r["value"],
                        "score": r.get("score", 0.0),
                    }
                    for r in results
                ],
            },
        }
    except Exception as exc:
        logger.exception("search_memories failed")
        return {"ok": False, "error": str(exc)}


def create_task(args: dict[str, Any]) -> dict[str, Any]:
    """Create a task / action item (optionally with a due date)."""
    import tasks_store

    description = str(args.get("description", "") or "").strip()
    if not description:
        return {"ok": False, "error": "description is required"}
    due_at = args.get("due_at") or None
    priority = str(args.get("priority", "normal") or "normal")
    try:
        task = tasks_store.create_task(
            description, due_at=due_at, priority=priority, source="assistant"
        )
        return {"ok": True, "data": {"task": task}}
    except Exception as exc:
        logger.exception("create_task failed")
        return {"ok": False, "error": str(exc)}


def list_tasks(args: dict[str, Any]) -> dict[str, Any]:
    """List the user's tasks; by default only open (incomplete) ones."""
    import tasks_store

    include_completed = bool(args.get("include_completed", False))
    try:
        tasks = tasks_store.list_tasks(include_completed=include_completed)
        return {"ok": True, "data": {"count": len(tasks), "tasks": tasks}}
    except Exception as exc:
        logger.exception("list_tasks failed")
        return {"ok": False, "error": str(exc)}


def _find_open_task(description: str) -> dict[str, Any] | None:
    """Match an open task by exact description, then best token overlap."""
    import tasks_store

    needle = (description or "").strip().lower()
    if not needle:
        return None
    open_tasks = tasks_store.list_tasks(include_completed=False)
    exact = next((t for t in open_tasks if t["description"].strip().lower() == needle), None)
    if exact:
        return exact
    # Substring containment handles short spoken phrases the model passes through —
    # e.g. "shooting" → "Shooting at 16:00" — which token-overlap scoring misses.
    contained = [
        t for t in open_tasks
        if needle in t["description"].strip().lower()
        or t["description"].strip().lower() in needle
    ]
    if len(contained) == 1:
        return contained[0]
    needle_tokens = {w for w in needle.split() if len(w) > 2}
    if not needle_tokens:
        return None
    best: dict[str, Any] | None = None
    best_score = 0.0
    for task in open_tasks:
        hay = task["description"].strip().lower()
        hay_tokens = {w for w in hay.split() if len(w) > 2}
        if not hay_tokens:
            continue
        overlap = len(needle_tokens & hay_tokens)
        if overlap == 0:
            continue
        score = overlap / max(len(needle_tokens), len(hay_tokens))
        if score > best_score:
            best_score = score
            best = task
    if best and best_score >= 0.75:
        return best
    return None


def complete_task(args: dict[str, Any]) -> dict[str, Any]:
    """Mark a task complete by id, or by best-effort description match."""
    import tasks_store

    task_id = args.get("task_id")
    if task_id is None:
        description = str(args.get("description", "") or "").strip()
        if not description:
            return {"ok": False, "error": "task_id or description is required"}
        match = _find_open_task(description)
        if not match:
            return {"ok": False, "error": f"no open task matching {description!r}"}
        task_id = match["id"]
    try:
        updated = tasks_store.set_completed(int(task_id), True)
        if not updated:
            return {"ok": False, "error": "task_not_found"}
        return {"ok": True, "data": {"task": updated}}
    except Exception as exc:
        logger.exception("complete_task failed")
        return {"ok": False, "error": str(exc)}


def search_activity(args: dict[str, Any]) -> dict[str, Any]:
    """Find past on-screen activity (apps/windows the user worked in) by keyword.

    Answers temporal questions like "what was I doing this morning" or
    "find when I was in Figma". Only distilled one-line summaries are stored;
    raw screenshots are never retained.
    """
    import activity_store

    query = str(args.get("query", "") or "").strip().lower()
    limit = int(args.get("limit", 20) or 20)
    since = args.get("since") or None
    try:
        rows = activity_store.list_activity(limit=max(1, min(limit, 200)), since=since)
        if query:
            rows = [
                r
                for r in rows
                if query in f"{r.get('app', '')} {r.get('title', '')} {r.get('summary', '')}".lower()
            ]
        return {
            "ok": True,
            "data": {
                "count": len(rows),
                "activity": [
                    {
                        "app": r.get("app", ""),
                        "title": r.get("title", ""),
                        "summary": r.get("summary", ""),
                        "captured_at": r.get("captured_at"),
                    }
                    for r in rows
                ],
            },
        }
    except Exception as exc:
        logger.exception("search_activity failed")
        return {"ok": False, "error": str(exc)}


def search_conversations(args: dict[str, Any]) -> dict[str, Any]:
    """Find past conversations by topic, returning titles + summaries to cite."""
    from conversation_store import search_conversations as _search

    query = str(args.get("query", "") or "").strip()
    limit = int(args.get("limit", 5) or 5)
    try:
        results = _search(query, limit=max(1, min(limit, 20)))
        return {
            "ok": True,
            "data": {
                "count": len(results),
                "conversations": [
                    {
                        "id": r["id"],
                        "title": r["title"],
                        "summary": r["summary"],
                        "category": r.get("category"),
                        "updated_at": r["updated_at"],
                        "score": r.get("score", 0.0),
                    }
                    for r in results
                ],
            },
        }
    except Exception as exc:
        logger.exception("search_conversations failed")
        return {"ok": False, "error": str(exc)}


def search_everything(args: dict[str, Any]) -> dict[str, Any]:
    """Unified recall across memories, conversations, activity, tasks, and meetings."""
    import recall_search

    query = str(args.get("query", "") or "").strip()
    limit = int(args.get("limit", 12) or 12)
    try:
        hits = recall_search.unified_search(query, limit=max(1, min(limit, 25)))
        return {"ok": True, "data": {"count": len(hits), "results": hits}}
    except Exception as exc:
        logger.exception("search_everything failed")
        return {"ok": False, "error": str(exc)}
