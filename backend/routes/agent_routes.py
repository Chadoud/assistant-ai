"""
Autonomous agent routes.

POST   /agent/task            — { goal: str, autonomous_mode?: bool } → { task_id: str }
GET    /agent/task/{id}       — SSE stream of step events
GET    /agent/task/{id}/status
POST   /agent/task/{id}/approve — { call_id, scope? } resolve tool consent
POST   /agent/task/{id}/deny    — { call_id } deny tool consent
DELETE /agent/task/{id}       — cancel
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from agent.task_queue import (
    AgentTask,
    cancel_task,
    create_task,
    get_task,
    run_task,
    stream_task_events,
)
from routes.ai_credentials import resolve_provider_credentials

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agent", tags=["agent"])


class AgentTaskRequest(BaseModel):
    goal: str = Field(..., min_length=1, max_length=8192)
    provider: str = Field(default="ollama", max_length=50)
    model: str | None = Field(default=None, max_length=200)
    api_key: str | None = Field(default=None, max_length=2048)
    base_url: str | None = Field(default=None, max_length=512)
    # Same meaning as voice WS ?autonomous_mode=1 — lifts AutonomyPolicy for SENSITIVE tools.
    autonomous_mode: bool = False


class AgentToolApprovalRequest(BaseModel):
    call_id: str = Field(..., min_length=1, max_length=128)
    scope: str = Field(default="once", max_length=16)


class AgentToolDenyRequest(BaseModel):
    call_id: str = Field(..., min_length=1, max_length=128)


@router.post("/task")
async def start_task(body: AgentTaskRequest, background_tasks: BackgroundTasks) -> dict:
    api_key, base_url = resolve_provider_credentials(body.provider, body.api_key, body.base_url)
    task: AgentTask = create_task(
        body.goal,
        provider=body.provider.strip().lower() or "ollama",
        model=(body.model or "").strip() or None,
        api_key=api_key,
        base_url=base_url,
        allow_sensitive=bool(body.autonomous_mode),
    )
    background_tasks.add_task(_run_task_bg, task)
    return {"task_id": task.task_id}


async def _run_task_bg(task: AgentTask) -> None:
    try:
        await run_task(task)
    except Exception:
        logger.exception("Background task %s crashed", task.task_id)


@router.get("/task/{task_id}")
async def stream_task(task_id: str) -> StreamingResponse:
    task = get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="task_not_found")

    return StreamingResponse(
        stream_task_events(task),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/task/{task_id}/status")
async def task_status(task_id: str) -> dict:
    task = get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="task_not_found")
    return {
        "task_id": task.task_id,
        "goal": task.goal,
        "status": task.status,
        "result": task.result,
        "error": task.error,
    }


@router.post("/task/{task_id}/approve")
async def approve_task_tool(task_id: str, body: AgentToolApprovalRequest) -> dict:
    task = get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="task_not_found")
    call_id = body.call_id.strip()
    if not call_id:
        raise HTTPException(status_code=400, detail="call_id_required")
    scope = (body.scope or "once").strip().lower()
    if scope == "session":
        task.approval_waiter.grant_screen_capture_session()
    task.approval_waiter.resolve(call_id, True)
    return {"ok": True}


@router.post("/task/{task_id}/deny")
async def deny_task_tool(task_id: str, body: AgentToolDenyRequest) -> dict:
    task = get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="task_not_found")
    call_id = body.call_id.strip()
    if not call_id:
        raise HTTPException(status_code=400, detail="call_id_required")
    task.approval_waiter.resolve(call_id, False)
    return {"ok": True}


@router.delete("/task/{task_id}")
async def cancel_task_route(task_id: str) -> dict:
    ok = cancel_task(task_id)
    if not ok:
        raise HTTPException(status_code=404, detail="task_not_found")
    return {"ok": True}
