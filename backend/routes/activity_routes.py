"""
REST endpoints for opt-in screen-activity capture + the activity timeline.

GET    /activity/status        — capture state (running, paused, counts)
POST   /activity/start         — begin capture (opt-in)
POST   /activity/stop          — stop capture
POST   /activity/pause         — pause for N minutes
POST   /activity/resume        — resume immediately
PUT    /activity/exclusions    — set app/title exclusion substrings
GET    /activity/timeline      — distilled activity entries (no images)
DELETE /activity/timeline      — clear the timeline
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

import activity_capture
import activity_store

router = APIRouter(prefix="/activity", tags=["activity"])


class StartBody(BaseModel):
    interval_sec: int | None = Field(default=None, ge=20, le=3600)
    retention_days: int | None = Field(default=None, ge=1, le=365)
    mode: str | None = Field(default=None, max_length=16)


class ModeBody(BaseModel):
    mode: str = Field(..., max_length=16)


class PauseBody(BaseModel):
    minutes: int = Field(default=60, ge=1, le=1440)


class ExclusionsBody(BaseModel):
    exclusions: list[str] = Field(default_factory=list)


@router.get("/status")
def status() -> dict[str, Any]:
    return activity_capture.status()


@router.post("/start")
def start(body: StartBody) -> dict[str, Any]:
    from entitlement_gate import assert_may_use_proactive

    assert_may_use_proactive()
    if body.mode:
        return activity_capture.set_capture_mode(body.mode)
    return activity_capture.start(
        interval_sec=body.interval_sec, retention_days=body.retention_days
    )


@router.post("/mode")
def set_mode(body: ModeBody) -> dict[str, Any]:
    from entitlement_gate import assert_may_use_proactive

    assert_may_use_proactive()
    return activity_capture.set_capture_mode(body.mode)


@router.post("/stop")
def stop() -> dict[str, Any]:
    return activity_capture.stop()


@router.post("/pause")
def pause(body: PauseBody) -> dict[str, Any]:
    return activity_capture.pause_for(body.minutes)


@router.post("/resume")
def resume() -> dict[str, Any]:
    return activity_capture.resume()


@router.put("/exclusions")
def set_exclusions(body: ExclusionsBody) -> dict[str, Any]:
    return activity_capture.set_exclusions(body.exclusions)


@router.get("/timeline")
def timeline(
    limit: int = Query(default=200, ge=1, le=1000),
    since: str | None = Query(default=None),
) -> list[dict[str, Any]]:
    return activity_store.list_activity(limit=limit, since=since)


@router.delete("/timeline")
def clear_timeline() -> dict[str, str]:
    activity_store.clear_activity()
    return {"ok": "true"}
