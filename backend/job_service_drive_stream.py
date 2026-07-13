"""Progressive Drive stream worker extracted from JobService."""

from __future__ import annotations

import logging
import pathlib
from typing import Any

from constants import DRIVE_STREAM_PATH_CAP
from job_models import JobFile
from job_service_stream_analyze import StreamAnalyzePending
from upload_staging import cleanup_browser_staging_dir

logger = logging.getLogger(__name__)


async def run_drive_import_streaming(
    service: Any,
    job_id: str,
    *,
    auto_apply: bool,
    initial_file_paths: list[str],
    runtime: dict,
) -> None:
    job = service.jobs.get(job_id)
    if not job:
        return
    job["worker_active"] = True
    job["drive_import_fetching"] = True
    job["drive_stream_paths_appended"] = 0
    service._save_jobs(force=True)

    if job_id not in service._drive_stream_queues:
        service._drive_stream_queues[job_id] = __import__("asyncio").Queue(maxsize=256)
    q = service._drive_stream_queues[job_id]

    cfg = job["config"]
    stream_cap = DRIVE_STREAM_PATH_CAP
    user_aborted = False
    pending = StreamAnalyzePending(service, job_id, job, cfg, runtime)
    try:

        async def _append_and_classify_paths(
            raw_paths: list[str], *, from_drive_stream: bool
        ) -> bool:
            nonlocal user_aborted
            for raw in raw_paths:
                if from_drive_stream and int(job.get("drive_stream_paths_appended", 0)) >= stream_cap:
                    return True
                if await service.honor_controls(job):
                    user_aborted = True
                    return True
                s = str(raw).strip()
                if not s:
                    continue
                if from_drive_stream and int(job.get("drive_stream_paths_appended", 0)) >= stream_cap:
                    return True
                row = JobFile(path=s, name=pathlib.Path(s).name).model_dump()
                job["files"].append(row)
                job["total"] = len(job["files"])
                idx = len(job["files"]) - 1
                if from_drive_stream:
                    job["drive_stream_paths_appended"] = int(job.get("drive_stream_paths_appended", 0)) + 1
                service._save_jobs(force=True)
                await pending.analyze_after_append(idx)
            return False

        if not await _append_and_classify_paths(list(initial_file_paths), from_drive_stream=False):
            while not user_aborted and not job.get("cancel_requested"):
                if await service.honor_controls(job):
                    user_aborted = True
                    break
                item = await q.get()
                if item is None:
                    logger.info(
                        "drive_stream_worker.stream_ended job_id=%s total_files=%d",
                        job_id,
                        len(job.get("files", [])),
                    )
                    break
                batch_size = len(item) if isinstance(item, list) else 1
                logger.info(
                    "drive_stream_worker.dequeued job_id=%s batch=%d cumulative=%d",
                    job_id,
                    batch_size,
                    len(job.get("files", [])),
                )
                if await _append_and_classify_paths(item, from_drive_stream=True):
                    break
    finally:
        await pending.drain(cancel_first=user_aborted or bool(job.get("cancel_requested")))
        service._drive_stream_queues.pop(job_id, None)
        job["drive_import_fetching"] = False
        job["worker_active"] = False
        service._save_jobs(force=True)

    if user_aborted or job.get("cancel_requested"):
        cleanup_browser_staging_dir(job)
        service._save_jobs(force=True)
        return

    logger.info(
        "drive_stream_worker.complete job_id=%s total_files=%d aborted=%s",
        job_id,
        len(job.get("files", [])),
        user_aborted or bool(job.get("cancel_requested")),
    )

    if not job.get("files"):
        job["error"] = "No files to sort."
        job["phase"] = "awaiting_approval"
        job["status"] = "awaiting_approval"
        service._touch_job(job, job.get("last_processed_index", -1))
        cleanup_browser_staging_dir(job)
        service._save_jobs(force=True)
        return

    if not job.get("cancel_requested"):
        job["phase"] = "awaiting_approval"
        job["status"] = "awaiting_approval"
        service._touch_job(job, job.get("last_processed_index", -1))
        if auto_apply:
            job["phase"] = "applying"
            job["status"] = "running"
            service._touch_job(job, job.get("last_processed_index", -1))
            await service.apply_files(job_id, False)
    service._save_jobs(force=True)
