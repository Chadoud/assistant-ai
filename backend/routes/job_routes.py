"""Sort jobs: compose analyze/apply and lifecycle routers."""

from __future__ import annotations

from fastapi import APIRouter

from routes.job_routes_analyze import create_job_analyze_router
from routes.job_routes_lifecycle import create_job_lifecycle_router


def create_job_router() -> APIRouter:
    router = APIRouter(tags=["jobs"])
    router.include_router(create_job_analyze_router())
    router.include_router(create_job_lifecycle_router())
    return router
