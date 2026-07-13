"""
Runtime handles for enqueueing analyze jobs from voice/agent tools.

Set from ``main._build_app`` (state objects) and the FastAPI ``startup`` event (event loop).
Intentionally decouples ``actions.*`` from importing ``main`` (avoids import cycles via tool_registry).
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from typing import Any

_jobs: dict[str, dict[str, Any]] | None = None
_save_jobs: Callable[..., None] | None = None
_job_service: Any | None = None
_main_loop: asyncio.AbstractEventLoop | None = None


def bind_voice_job_enqueue_runtime(
    jobs: dict[str, dict[str, Any]],
    save_jobs: Callable[..., None],
    job_service: Any,
) -> None:
    """Wire job store references used by synchronous tool handlers."""
    global _jobs, _save_jobs, _job_service
    _jobs = jobs
    _save_jobs = save_jobs
    _job_service = job_service


def capture_main_event_loop_for_tools() -> None:
    """Call once from FastAPI startup — tools run in threads and schedule work onto this loop."""
    global _main_loop
    _main_loop = asyncio.get_running_loop()


def get_voice_job_enqueue_runtime(
) -> tuple[dict[str, dict[str, Any]], Callable[..., None], Any, asyncio.AbstractEventLoop]:
    """Return handles or raise if startup binding is incomplete."""
    if (
        _jobs is None
        or _save_jobs is None
        or _job_service is None
        or _main_loop is None
    ):
        raise RuntimeError("Voice sort runtime is not ready yet (startup incomplete).")
    return _jobs, _save_jobs, _job_service, _main_loop
