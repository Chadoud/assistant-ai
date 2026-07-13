"""
Autonomous agent routes.

POST   /agent/task            — { goal: str } → { task_id: str }
GET    /agent/task/{id}       — SSE stream of step events
GET    /agent/task/{id}/status
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


@router.post("/task")
async def start_task(body: AgentTaskRequest, background_tasks: BackgroundTasks) -> dict:
    api_key, base_url = resolve_provider_credentials(body.provider, body.api_key, body.base_url)
    task: AgentTask = create_task(
        body.goal,
        provider=body.provider.strip().lower() or "ollama",
        model=(body.model or "").strip() or None,
        api_key=api_key,
        base_url=base_url,
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


@router.delete("/task/{task_id}")
async def cancel_task_route(task_id: str) -> dict:
    ok = cancel_task(task_id)
    if not ok:
        raise HTTPException(status_code=404, detail="task_not_found")
    return {"ok": True}
