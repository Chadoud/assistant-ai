"""Forward scrubbed crash reports to the central account API."""

from __future__ import annotations

import logging

import httpx

from .config import CrashIngestConfig
from .forward_guard import should_block_crash_forward
from .schemas import CrashReportIn

logger = logging.getLogger(__name__)


class CrashForwardError(RuntimeError):
    """Raised when the crash report could not be delivered to the ingest API."""


async def forward_crash_report(conf: CrashIngestConfig, body: CrashReportIn) -> None:
    """POST one crash report to the ingest API. Raises CrashForwardError on failure."""
    blocked, reason = should_block_crash_forward(body)
    if blocked:
        logger.debug("crash_reports.forward_skipped reason=%s source=%s", reason, body.source)
        return

    headers = {"X-Crash-Token": conf.token}
    try:
        async with httpx.AsyncClient(
            timeout=conf.timeout_seconds, verify=conf.verify_ssl
        ) as client:
            response = await client.post(conf.url, json=body.model_dump(), headers=headers)
            response.raise_for_status()
    except httpx.HTTPError as exc:
        raise CrashForwardError(str(exc)) from exc
