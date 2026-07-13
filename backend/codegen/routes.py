"""
Codegen Studio HTTP + SSE routes.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from codegen.runner import (
    mark_preview_ready,
    repair_session_files,
    run_session,
    stream_session_events,
)
from codegen.session_store import (
    SessionStatus,
    create_follow_up_session,
    create_session,
    get_session,
)
from routes.ai_credentials import resolve_provider_credentials

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/codegen", tags=["codegen"])


class CodegenSessionRequest(BaseModel):
    goal: str = Field(..., min_length=1, max_length=16384)
    provider: str = Field(default="ollama", max_length=50)
    model: str | None = Field(default=None, max_length=200)
    api_key: str | None = Field(default=None, max_length=2048)
    base_url: str | None = Field(default=None, max_length=512)
    follow_up: bool = Field(default=False, description="Patch existing session project")
    prior_session_id: str | None = Field(default=None, max_length=64)


class PreviewReportRequest(BaseModel):
    preview_url: str = Field(..., min_length=4, max_length=512)
    log_tail: str = Field(default="", max_length=16000)


class RepairRequest(BaseModel):
    error: str = Field(..., min_length=1, max_length=8000)
    log_tail: str = Field(default="", max_length=16000)


@router.post("/session")
async def start_session(body: CodegenSessionRequest, background_tasks: BackgroundTasks) -> dict:
    api_key, base_url = resolve_provider_credentials(body.provider, body.api_key, body.base_url)
    provider = body.provider.strip().lower() or "ollama"
    model = (body.model or "").strip() or None
    if body.follow_up and body.prior_session_id:
        session = create_follow_up_session(
            body.goal,
            body.prior_session_id.strip(),
            provider=provider,
            model=model,
            api_key=api_key,
            base_url=base_url,
        )
    else:
        session = create_session(
            body.goal,
            provider=provider,
            model=model,
            api_key=api_key,
            base_url=base_url,
        )
    background_tasks.add_task(_run_bg, session, body.follow_up)
    return {"session_id": session.session_id, "project_path": session.project_path}


async def _run_bg(session, follow_up: bool) -> None:
    try:
        await run_session(session, is_follow_up=follow_up)
    except Exception:
        logger.exception("Codegen session %s crashed", session.session_id)


@router.get("/session/{session_id}")
async def stream_session(session_id: str) -> StreamingResponse:
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="session_not_found")
    return StreamingResponse(
        stream_session_events(session),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/session/{session_id}/status")
async def session_status(session_id: str) -> dict:
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="session_not_found")
    return {
        "session_id": session.session_id,
        "goal": session.goal,
        "status": session.status.value,
        "project_path": session.project_path,
        "preview_url": session.preview_url,
        "stack_label": session.stack_label,
        "install_command": session.install_command,
        "dev_command": session.dev_command,
        "files_written": session.files_written,
        "error": session.error,
        "log_tail": session.log_tail,
        "plan_steps": session.plan_steps,
        "repair_attempts": session.repair_attempts,
    }


@router.post("/session/{session_id}/preview")
async def report_preview(session_id: str, body: PreviewReportRequest) -> dict:
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="session_not_found")
    mark_preview_ready(session, body.preview_url.strip(), body.log_tail)
    return {
        "ok": True,
        "preview_url": session.preview_url,
        "stack_label": session.stack_label,
        "project_path": session.project_path,
    }


@router.post("/session/{session_id}/repair")
async def repair_session(session_id: str, body: RepairRequest) -> dict:
    """Self-correct a broken build: regenerate the offending files on disk."""
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="session_not_found")
    error_text = body.error.strip()
    if body.log_tail.strip():
        error_text = f"{error_text}\n\nDev server log:\n{body.log_tail.strip()[-4000:]}"
    return await repair_session_files(session, error_text)


@router.post("/session/{session_id}/log")
async def append_log(session_id: str, body: PreviewReportRequest) -> dict:
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="session_not_found")
    if body.log_tail:
        session.log_tail = (session.log_tail + "\n" + body.log_tail)[-8000:]
    return {"ok": True}


@router.delete("/session/{session_id}")
async def cancel_session(session_id: str) -> dict:
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="session_not_found")
    session.cancel_event.set()
    session.status = SessionStatus.cancelled
    return {"ok": True}
