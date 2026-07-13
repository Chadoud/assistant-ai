"""Job routes: job record fetch, pause/resume/cancel/retry, folder tree."""

from __future__ import annotations

import pathlib
from collections.abc import Callable
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field

from api_schemas import FolderTreeRequest
from context_index import ContextIndex
from deps import get_context_index, get_history_log, get_job_service, get_jobs, get_save_jobs
from history import HistoryLog
from job_models import JobFile
from job_service import JobService
from routes.job_enqueue_helpers import require_job
from sorter import get_folder_tree, undo_sort
from upload_staging import cleanup_browser_staging_dir, is_safe_staging_dir


class AppendClassifyPathsRequest(BaseModel):
    """Add locally staged paths to an existing job and re-run classification on pending rows."""

    file_paths: list[str] = Field(default_factory=list)
    """New Drive download failure count to accumulate (optional — passed when retry also has partial failures)."""
    drive_fetch_failures: int | None = None
    """New failed Drive file IDs from this retry attempt."""
    drive_failed_file_ids: list[str] = Field(default_factory=list)


def create_job_lifecycle_router() -> APIRouter:
    router = APIRouter(tags=["jobs"])

    @router.get("/job/{job_id}")
    def get_job(
        job_id: str,
        jobs: Annotated[dict[str, dict], Depends(get_jobs)],
    ):
        return require_job(jobs, job_id)

    @router.get("/job/{job_id}/structure-summary")
    def get_job_structure_summary(
        job_id: str,
        jobs: Annotated[dict[str, dict], Depends(get_jobs)],
    ):
        from sort_structure.summary import build_structure_summary

        job = require_job(jobs, job_id)
        summary = build_structure_summary(job)
        return {"job_id": job_id, **summary}

    @router.post("/job/{job_id}/pause")
    def pause_job(
        job_id: str,
        jobs: Annotated[dict[str, dict], Depends(get_jobs)],
        save_jobs: Annotated[Callable[..., None], Depends(get_save_jobs)],
    ):
        job = require_job(jobs, job_id)
        job["pause_requested"] = True
        job["status"] = "paused"
        save_jobs(force=True)
        return {"success": True}

    @router.post("/job/{job_id}/resume")
    def resume_job(
        job_id: str,
        background_tasks: BackgroundTasks,
        jobs: Annotated[dict[str, dict], Depends(get_jobs)],
        save_jobs: Annotated[Callable[..., None], Depends(get_save_jobs)],
        job_service: Annotated[JobService, Depends(get_job_service)],
    ):
        job = require_job(jobs, job_id)
        job["pause_requested"] = False
        files = job.get("files", [])
        if job.get("worker_active"):
            job["status"] = "running"
            save_jobs(force=True)
            return {"success": True}
        if any(f.get("status") == "applying" for f in files) or job.get("phase") == "applying":
            job["phase"] = "applying"
            job["worker_active"] = True
            background_tasks.add_task(job_service.apply_files, job_id, False)
        elif job.get("phase") in {"paused", "analyzing"}:
            job["phase"] = "analyzing"
            job["worker_active"] = True
            background_tasks.add_task(job_service.analyze_files, job_id, False, False)
        job["status"] = "running"
        save_jobs(force=True)
        return {"success": True}

    @router.post("/job/{job_id}/cancel")
    def cancel_job(
        job_id: str,
        jobs: Annotated[dict[str, dict], Depends(get_jobs)],
        save_jobs: Annotated[Callable[..., None], Depends(get_save_jobs)],
        job_service: Annotated[JobService, Depends(get_job_service)],
        history: Annotated[HistoryLog, Depends(get_history_log)],
        context_index: Annotated[ContextIndex, Depends(get_context_index)],
    ):
        job = require_job(jobs, job_id)
        job["cancel_requested"] = True
        job["status"] = "cancelled"
        job_service.signal_drive_stream_ended(job_id)
        cleanup_browser_staging_dir(job)

        # Undo any files that were already applied in this job's session.
        # copy mode  → deletes the sorted copy from the output folder.
        # move mode  → moves the file back to its original location.
        session_id = job.get("session_id")
        if session_id:
            entries = history.get_session_entries(session_id)
            for entry in reversed(entries):
                if entry.get("undone"):
                    continue
                ok = undo_sort(
                    entry["source_path"],
                    entry["dest_path"],
                    entry["mode"],
                    folder_name=str(entry.get("folder_name") or "") or None,
                )
                if ok:
                    history.mark_undone(entry["id"])
                    context_index.remove_file(entry["folder_name"], entry["dest_path"])
            context_index.save()

        save_jobs(force=True)
        return {"success": True}

    @router.post("/job/{job_id}/retry-failed")
    def retry_failed(
        job_id: str,
        background_tasks: BackgroundTasks,
        jobs: Annotated[dict[str, dict], Depends(get_jobs)],
        save_jobs: Annotated[Callable[..., None], Depends(get_save_jobs)],
        job_service: Annotated[JobService, Depends(get_job_service)],
    ):
        job = require_job(jobs, job_id)
        phase = job.get("phase")
        if phase in {"awaiting_approval", "analyzing", "paused"}:
            job["phase"] = "analyzing"
            job["status"] = "running"
            job["cancel_requested"] = False
            job["pause_requested"] = False
            job["worker_active"] = True
            save_jobs(force=True)
            background_tasks.add_task(job_service.analyze_files, job_id, True, False)
            return {"success": True}
        if phase in {"applying", "done", "cancelled"}:
            job["phase"] = "applying"
            job["status"] = "running"
            job["cancel_requested"] = False
            job["pause_requested"] = False
            job["worker_active"] = True
            save_jobs(force=True)
            background_tasks.add_task(job_service.apply_files, job_id, True)
            return {"success": True}
        raise HTTPException(status_code=400, detail="Job phase not retryable")

    @router.get("/job/{job_id}/drive-failed-file-ids")
    def get_drive_failed_file_ids(
        job_id: str,
        jobs: Annotated[dict[str, dict], Depends(get_jobs)],
    ):
        """Return the Drive file IDs that failed to download in the most recent import."""
        job = require_job(jobs, job_id)
        return {
            "file_ids": list(job.get("drive_import_failed_file_ids") or []),
            "fetch_failures": int(job.get("drive_import_fetch_failures") or 0),
        }

    @router.post("/job/{job_id}/append-classify-paths")
    async def append_classify_paths(
        job_id: str,
        body: AppendClassifyPathsRequest,
        background_tasks: BackgroundTasks,
        jobs: Annotated[dict[str, dict], Depends(get_jobs)],
        save_jobs: Annotated[Callable[..., None], Depends(get_save_jobs)],
        job_service: Annotated[JobService, Depends(get_job_service)],
    ):
        """Append locally staged paths to a job and re-run classification on all pending/error rows.

        Used for Drive download retries: previously downloaded files stay in review_ready/done;
        newly appended rows (status=pending) are picked up by analyze_files automatically.
        """
        job = require_job(jobs, job_id)
        phase = job.get("phase")
        if phase not in {"awaiting_approval", "analyzing", "paused", "error"}:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot append paths to a job in phase '{phase}'.",
            )
        paths = [str(p).strip() for p in (body.file_paths or []) if str(p).strip()]
        for raw in paths:
            if not is_safe_staging_dir(pathlib.Path(raw)):
                raise HTTPException(status_code=400, detail=f"Path is outside the allowed staging root: {pathlib.Path(raw).name}")
            row = JobFile(path=raw, name=pathlib.Path(raw).name).model_dump()
            job["files"].append(row)
        job["total"] = len(job["files"])
        # Accumulate any new download failures from this retry attempt.
        if body.drive_fetch_failures and body.drive_fetch_failures > 0:
            prev = int(job.get("drive_import_fetch_failures") or 0)
            job["drive_import_fetch_failures"] = prev + body.drive_fetch_failures
        if body.drive_failed_file_ids:
            existing: list[str] = list(job.get("drive_import_failed_file_ids") or [])
            new_ids = [fid for fid in body.drive_failed_file_ids if fid not in existing]
            if new_ids:
                job["drive_import_failed_file_ids"] = existing + new_ids
        job["phase"] = "analyzing"
        job["status"] = "running"
        job["cancel_requested"] = False
        job["pause_requested"] = False
        job["worker_active"] = True
        save_jobs(force=True)
        # retry_failed_only=False so pending rows are included; review_ready/done rows are skipped.
        background_tasks.add_task(job_service.analyze_files, job_id, False, False)
        return {"success": True, "appended": len(paths)}

    @router.post("/folder-tree")
    def folder_tree(req: FolderTreeRequest):
        return {"tree": get_folder_tree(req.output_dir)}

    return router
