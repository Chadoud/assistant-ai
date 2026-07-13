"""HTTP ingest for opt-in crash reports → optional MySQL."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request, status

from telemetry.rate_limit_memory import allow

from .config import crash_ingest_config
from .repository import CrashForwardError, forward_crash_report
from .schemas import CrashReportIn

logger = logging.getLogger(__name__)

MAX_BODY_BYTES = 96_768

router = APIRouter(prefix="/v1/crash-reports", tags=["crash-reports"])


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    if request.client:
        return request.client.host[:64]
    return "unknown"


@router.post("")
async def post_crash_report(request: Request, body: CrashReportIn) -> dict:
    conf = crash_ingest_config()
    if not conf:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Crash report storage is not configured on this server.",
        )

    raw_len = int(request.headers.get("content-length") or 0)
    if raw_len > MAX_BODY_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Body too large")

    ip = _client_ip(request)
    if not allow(f"crash:{ip}", max_events=30, window_seconds=60.0):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail="Rate limit")

    try:
        await forward_crash_report(conf, body)
    except CrashForwardError as exc:
        # An unreachable ingest API (bad DNS, offline, blocked port) is an expected,
        # recoverable condition — not a bug in this app. Log one concise line with the
        # cause instead of dumping a full multi-frame traceback per forwarded crash
        # event, which floods the logs and hides real errors.
        logger.warning(
            "crash_reports.forward_failed: could not reach ingest API %s (%s)",
            conf.url,
            exc,
        )
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail="Could not store crash report.",
        ) from exc

    return {"ok": True}
