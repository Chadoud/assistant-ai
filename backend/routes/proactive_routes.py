"""
REST endpoints for the proactive layer: daily digest + notification center.

POST /digest/generate      — build today's digest (LLM or deterministic fallback)
GET  /digest/latest        — most recent digest
GET  /digest               — recent digest headlines
POST /nudges/generate      — generate rate-limited nudges; returns newly created
GET  /nudges               — list nudges (notification center)
POST /nudges/{id}/dismiss  — dismiss one
POST /nudges/dismiss-all   — dismiss all
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query

import daily_digest
import nudges
from telemetry.rate_limit_memory import allow

router = APIRouter(tags=["proactive"])


@router.post("/digest/generate")
def generate_digest() -> dict[str, Any]:
    from entitlement_gate import assert_may_use_proactive

    assert_may_use_proactive()
    if not allow("digest_generate", 6, 86400):
        raise HTTPException(status_code=429, detail="digest_rate_limited")
    return daily_digest.generate_digest()


@router.get("/digest/latest")
def latest_digest() -> dict[str, Any]:
    digest = daily_digest.latest_digest()
    if not digest:
        raise HTTPException(status_code=404, detail="no_digest")
    return digest


@router.get("/digest")
def list_digests(limit: int = Query(default=14, ge=1, le=60)) -> list[dict[str, Any]]:
    return daily_digest.list_digests(limit=limit)


@router.post("/nudges/generate")
def generate_nudges() -> dict[str, Any]:
    created = nudges.generate_nudges()
    return {"created": created, "count": len(created)}


@router.get("/nudges")
def list_nudges(
    include_dismissed: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[dict[str, Any]]:
    return nudges.list_nudges(include_dismissed=include_dismissed, limit=limit)


@router.post("/nudges/{nudge_id}/dismiss")
def dismiss_nudge(nudge_id: int) -> dict[str, Any]:
    removed = nudges.dismiss_nudge(nudge_id)
    if not removed:
        raise HTTPException(status_code=404, detail="nudge_not_found")
    return {"ok": "true"}


@router.post("/nudges/dismiss-all")
def dismiss_all() -> dict[str, Any]:
    return {"ok": "true", "dismissed": nudges.dismiss_all()}


@router.get("/proactive/scheduler/status")
def scheduler_status() -> dict[str, Any]:
    """Per-job last-run timestamps so the UI can show scheduler-driven freshness."""
    from proactive_scheduler import scheduler_status as _status

    return _status()


@router.get("/proactive/failures")
def recent_agent_failures(limit: int = Query(default=10, ge=1, le=50)) -> list[dict[str, Any]]:
    """Recent agent run failures for the To Do → Inbox panel."""
    from orchestrator import memory as orch_memory

    rows = orch_memory.recent(limit, kinds=[orch_memory.KIND_FAILURE])
    return [
        {
            "id": row.id,
            "content": row.content,
            "created_at": row.created_at,
        }
        for row in rows
    ]


@router.post("/proactive/failures/{failure_id}/dismiss")
def dismiss_agent_failure(failure_id: int) -> dict[str, Any]:
    """Remove one agent failure from the inbox (does not affect task history elsewhere)."""
    from orchestrator import memory as orch_memory

    removed = orch_memory.forget(failure_id)
    if not removed:
        raise HTTPException(status_code=404, detail="failure_not_found")
    return {"ok": True}
