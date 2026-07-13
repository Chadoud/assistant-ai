"""FastAPI routes for telemetry — mount on main app."""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, status

from .rate_limit_memory import allow
from .repository import TelemetryRepository
from .schemas import FeedbackIn, TelemetryBatchIn
from .service import TelemetryService

MAX_BODY_BYTES = 32_768


def _db_path() -> Path:
    raw = os.environ.get("TELEMETRY_SQLITE_PATH", "").strip()
    if raw:
        return Path(raw)
    # Default: next to backend cwd
    return Path(__file__).resolve().parent / "data" / "telemetry.sqlite"


_repo = TelemetryRepository(_db_path())
_service = TelemetryService(_repo)

router = APIRouter(prefix="/v1/telemetry", tags=["telemetry"])


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    if request.client:
        return request.client.host[:64]
    return "unknown"


@router.post("/events")
async def post_events(request: Request, body: TelemetryBatchIn) -> dict:
    ip = _client_ip(request)
    if not allow(f"tel:{ip}", max_events=120, window_seconds=60.0):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail="Rate limit")
    if not allow(f"tel:i:{body.instance_id[:48]}", max_events=60, window_seconds=60.0):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail="Rate limit")
    return _service.record_batch(body)


@router.post("/feedback")
async def post_feedback(request: Request, body: FeedbackIn) -> dict:
    ip = _client_ip(request)
    if not allow(f"fb:{ip}", max_events=20, window_seconds=60.0):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail="Rate limit")
    if not allow(f"fb:i:{body.instance_id[:48]}", max_events=10, window_seconds=300.0):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail="Rate limit")
    return _service.record_feedback(body)
