"""
FastAPI dependencies — shared process state is attached to `app.state` in `main.py`.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from fastapi import Depends, Request

from context_index import ContextIndex
from history import HistoryLog
from job_service import JobService


def get_jobs(request: Request) -> dict[str, dict]:
    return request.app.state.jobs


def get_save_jobs(request: Request) -> Callable[..., None]:
    return request.app.state.save_jobs


def get_job_service(request: Request) -> JobService:
    return request.app.state.job_service


def get_history_log(request: Request) -> HistoryLog:
    return request.app.state.history


def get_context_index(request: Request) -> ContextIndex:
    return request.app.state.context_index


@dataclass
class JobWriteDeps:
    """Bundles the three dependencies required by every job-mutation route handler."""

    jobs: dict[str, dict]
    save_jobs: Callable[..., None]
    job_service: JobService


def get_job_write_deps(
    jobs: dict[str, dict] = Depends(get_jobs),
    save_jobs: Callable[..., None] = Depends(get_save_jobs),
    job_service: JobService = Depends(get_job_service),
) -> JobWriteDeps:
    return JobWriteDeps(jobs=jobs, save_jobs=save_jobs, job_service=job_service)
