"""Job routes: analyze, sort, apply, multipart uploads, multi-source analyze."""

from __future__ import annotations

import asyncio
import logging
import pathlib
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile

logger = logging.getLogger(__name__)

from api_schemas import (
    AnalyzeWithSourcesJobRequest,
    ApplyRequest,
    DriveStreamChunkRequest,
    DriveStreamStartRequest,
    FileJobRequest,
)
from deps import JobWriteDeps, get_job_write_deps
from destination_path import normalize_rel_dest
from gmail_google_oauth import get_valid_access_token
from job_source_compose import (
    resolve_analyze_paths_local_only,
    resolve_analyze_paths_with_optional_gmail,
)
from routes.job_enqueue_helpers import (
    enqueue_analyze_job,
    enqueue_analyze_job_core,
    enqueue_browser_multipart_job,
    enqueue_drive_streaming_analyze,
    require_job,
)
from upload_staging import is_safe_staging_dir


def create_job_analyze_router() -> APIRouter:
    router = APIRouter(tags=["jobs"])

    @router.post("/analyze")
    async def start_analyze(
        req: FileJobRequest,
        background_tasks: BackgroundTasks,
        d: Annotated[JobWriteDeps, Depends(get_job_write_deps)],
    ):
        return enqueue_analyze_job(d.jobs, d.save_jobs, d.job_service, req, background_tasks, auto_apply=False)

    @router.post("/analyze/with-sources")
    async def analyze_with_sources(
        body: AnalyzeWithSourcesJobRequest,
        background_tasks: BackgroundTasks,
        d: Annotated[JobWriteDeps, Depends(get_job_write_deps)],
    ):
        """Expand local paths and optionally merge a Gmail export into the same analyze job."""

        def _resolve() -> tuple[list[str], list[pathlib.Path]]:
            if body.gmail is None:
                return resolve_analyze_paths_local_only(body.file_paths, body.output_dir), []
            tok = get_valid_access_token()
            return resolve_analyze_paths_with_optional_gmail(
                body.file_paths,
                body.output_dir,
                tok,
                body.gmail,
            )

        loop = asyncio.get_running_loop()
        try:
            merged_paths, staging_roots = await loop.run_in_executor(None, _resolve)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=401, detail=str(exc)) from exc

        return enqueue_analyze_job_core(
            d.jobs,
            d.save_jobs,
            d.job_service,
            body,
            False,
            merged_paths,
            staging_roots,
            background_tasks=background_tasks,
        )

    @router.post("/analyze-upload")
    async def analyze_upload(
        background_tasks: BackgroundTasks,
        payload: Annotated[str, Form()],
        files: Annotated[list[UploadFile], File()],
        d: Annotated[JobWriteDeps, Depends(get_job_write_deps)],
    ):
        """Browser-friendly: multipart file bodies saved to disk, then same pipeline as ``/analyze``."""
        return await enqueue_browser_multipart_job(
            payload, files, jobs=d.jobs, save_jobs=d.save_jobs, job_service=d.job_service,
            background_tasks=background_tasks, auto_apply=False,
        )

    @router.post("/sort-upload")
    async def sort_upload(
        background_tasks: BackgroundTasks,
        payload: Annotated[str, Form()],
        files: Annotated[list[UploadFile], File()],
        d: Annotated[JobWriteDeps, Depends(get_job_write_deps)],
    ):
        """Multipart uploads with auto-apply (same as ``/sort``)."""
        return await enqueue_browser_multipart_job(
            payload, files, jobs=d.jobs, save_jobs=d.save_jobs, job_service=d.job_service,
            background_tasks=background_tasks, auto_apply=True,
        )

    @router.post("/sort")
    async def start_sort(
        req: FileJobRequest,
        background_tasks: BackgroundTasks,
        d: Annotated[JobWriteDeps, Depends(get_job_write_deps)],
    ):
        return enqueue_analyze_job(d.jobs, d.save_jobs, d.job_service, req, background_tasks, auto_apply=True)

    @router.post("/analyze/drive-stream")
    def start_analyze_drive_stream(
        body: DriveStreamStartRequest,
        background_tasks: BackgroundTasks,
        d: Annotated[JobWriteDeps, Depends(get_job_write_deps)],
    ):
        """Progressive Google Drive (Electron list/import + backend classify)."""
        return enqueue_drive_streaming_analyze(d.jobs, d.save_jobs, d.job_service, body, background_tasks, auto_apply=False)

    @router.post("/sort/drive-stream")
    def start_sort_drive_stream(
        body: DriveStreamStartRequest,
        background_tasks: BackgroundTasks,
        d: Annotated[JobWriteDeps, Depends(get_job_write_deps)],
    ):
        """Progressive Google Drive with auto-apply when classification finishes."""
        return enqueue_drive_streaming_analyze(d.jobs, d.save_jobs, d.job_service, body, background_tasks, auto_apply=True)

    @router.post("/job/{job_id}/drive-stream-chunk")
    async def post_drive_stream_chunk(
        job_id: str,
        body: DriveStreamChunkRequest,
        d: Annotated[JobWriteDeps, Depends(get_job_write_deps)],
    ):
        """Append one batch of local paths from a Drive import wave, then optionally end the stream."""
        jobs = d.jobs
        save_jobs = d.save_jobs
        job_service = d.job_service
        job = require_job(jobs, job_id)
        if job.get("drive_stream_incoming_ended"):
            raise HTTPException(status_code=400, detail="Drive stream already ended.")
        q = job_service.drive_stream_queue(job_id)
        if q is None:
            raise HTTPException(
                status_code=400, detail="This job is not a Drive stream job or the stream is not ready.",
            )
        bsd = str(body.browser_staging_dir or "").strip()
        if bsd:
            if not is_safe_staging_dir(pathlib.Path(bsd)):
                logger.warning(
                    "drive_stream_chunk.rejected_staging_dir job_id=%s",
                    job_id,
                )
                raise HTTPException(status_code=400, detail="browser_staging_dir is outside the allowed staging root.")
            have = list(job.get("_browser_staging_dirs", [])) if isinstance(job.get("_browser_staging_dirs"), list) else []
            if bsd not in have:
                have.append(bsd)
            job["_browser_staging_dirs"] = have
        path_count = len([p for p in (body.file_paths or []) if str(p).strip()])
        logger.info(
            "drive_stream_chunk.accepted job_id=%s paths=%d ended=%s",
            job_id,
            path_count,
            body.ended,
        )
        if body.drive_listing_discovered is not None:
            try:
                dld = int(body.drive_listing_discovered)
            except (TypeError, ValueError):
                dld = 0
            if dld >= 0:
                old = int(job.get("drive_listing_discovered") or 0)
                job["drive_listing_discovered"] = max(old, dld)
        if body.drive_files_in_source is not None:
            try:
                dfs = int(body.drive_files_in_source)
            except (TypeError, ValueError):
                dfs = 0
            if dfs >= 0:
                old = int(job.get("drive_files_in_source") or 0)
                job["drive_files_in_source"] = max(old, dfs)
        # Accumulate Drive download failures so the UI can display a count and offer retry.
        if body.drive_fetch_failures is not None and body.drive_fetch_failures > 0:
            prev = int(job.get("drive_import_fetch_failures") or 0)
            job["drive_import_fetch_failures"] = prev + body.drive_fetch_failures
        if body.drive_failed_file_ids:
            existing: list[str] = list(job.get("drive_import_failed_file_ids") or [])
            new_ids = [fid for fid in body.drive_failed_file_ids if fid not in existing]
            if new_ids:
                job["drive_import_failed_file_ids"] = existing + new_ids
        paths = [str(p).strip() for p in (body.file_paths or []) if str(p).strip()]
        if paths:
            await q.put(paths)
        if body.ended:
            job["drive_stream_incoming_ended"] = True
            await q.put(None)
        save_jobs(force=True)
        return {"success": True}

    @router.post("/apply")
    async def apply_approved(
        req: ApplyRequest,
        background_tasks: BackgroundTasks,
        d: Annotated[JobWriteDeps, Depends(get_job_write_deps)],
    ):
        jobs = d.jobs
        save_jobs = d.save_jobs
        job_service = d.job_service
        job = require_job(jobs, req.job_id)

        items_by_path = {i.path: i for i in req.items}
        for f in job.get("files", []):
            item = items_by_path.get(f["path"])
            if item:
                f["approved"] = bool(item.approved)
                if item.folder is not None and str(item.folder).strip():
                    f["final_folder"] = normalize_rel_dest(str(item.folder).strip())
        job["phase"] = "applying"
        job["status"] = "running"
        job["pause_requested"] = False
        job["cancel_requested"] = False
        job["completed"] = 0
        job["worker_active"] = True
        save_jobs(force=True)
        background_tasks.add_task(job_service.apply_files, req.job_id, False)
        return {"job_id": req.job_id}

    return router
