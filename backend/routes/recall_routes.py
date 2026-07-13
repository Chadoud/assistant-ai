"""Unified recall search routes."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query

import recall_search

router = APIRouter(prefix="/recall", tags=["recall"])


@router.get("/search")
def search(q: str = Query(default="", max_length=500), limit: int = Query(default=20, ge=1, le=50)) -> dict[str, Any]:
    """Search memories, conversations, activity, tasks, and meetings in one call."""
    hits = recall_search.unified_search(q, limit=limit)
    return {"query": q, "count": len(hits), "results": hits}
