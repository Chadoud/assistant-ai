"""Combined progressive Drive stream + Gmail export interleaved into one classify pipeline."""

from __future__ import annotations

import asyncio
import logging
import pathlib
import threading
from typing import Any

from constants import (
    DRIVE_STREAM_PATH_CAP,
    GMAIL_MESSAGE_FETCH_BATCH_SIZE,
    GMAIL_MESSAGE_PREFETCH_QUEUE_MAX,
)
from gmail_google_oauth import get_valid_access_token
from gmail_import import iter_gmail_export_file_paths, refine_result_size_estimate_value
from job_models import JobFile
from job_service_stream_analyze import StreamAnalyzePending
from upload_staging import cleanup_browser_staging_dir

logger = logging.getLogger(__name__)


async def run_drive_and_gmail_import_streaming(
    service: Any,
    job_id: str,
    *,
    auto_apply: bool,
    initial_file_paths: list[str],
    runtime: dict,
    access_token: str,
    gmail_staging_root: pathlib.Path,
    gmail_query: str,
    max_messages: int,
    import_content: str,
) -> None:
    """
    Merge Drive chunks (from ``_drive_stream_queues``) and Gmail export paths into one ordered
    classify loop. Drive may finish before Gmail or vice versa.
    """
    job = service.jobs.get(job_id)
    if not job:
        return

    job["worker_active"] = True
    job["drive_import_fetching"] = True
    job["gmail_import_fetching"] = True
    job["drive_stream_paths_appended"] = 0
    service._save_jobs(force=True)

    if job_id not in service._drive_stream_queues:
        service._drive_stream_queues[job_id] = asyncio.Queue(maxsize=256)
    drive_q = service._drive_stream_queues[job_id]

    cfg = job["config"]
    stream_cap = DRIVE_STREAM_PATH_CAP
    user_aborted = False
    pending = StreamAnalyzePending(service, job_id, job, cfg, runtime)

    loop = asyncio.get_running_loop()
    merge_q: asyncio.Queue[tuple[str, Any]] = asyncio.Queue()

    _gmail_stream_q = max(
        64,
        int(GMAIL_MESSAGE_PREFETCH_QUEUE_MAX) + int(GMAIL_MESSAGE_FETCH_BATCH_SIZE) * 4,
    )
    export_stats: dict[str, int] = {
        "messages_completed": 0,
        "text_files": 0,
        "attachment_files": 0,
        "attachment_fetch_failures": 0,
        "staging_capped": 0,
    }
    export_stats_lock = threading.Lock()

    def _apply_gmail_export_stats_to_job(j: dict) -> None:
        with export_stats_lock:
            j["gmail_export_messages"] = int(export_stats["messages_completed"])
            j["gmail_export_text_files"] = int(export_stats["text_files"])
            j["gmail_export_attachment_files"] = int(export_stats["attachment_files"])
            j["gmail_export_attachment_fetch_failures"] = int(export_stats["attachment_fetch_failures"])
            j["gmail_export_staging_capped"] = bool(export_stats.get("staging_capped", 0))

    async def _persist_gmail_export_stats_only() -> None:
        j = service.jobs.get(job_id)
        if j is None:
            return
        _apply_gmail_export_stats_to_job(j)
        service._save_jobs(force=True)

    def _on_gmail_message_no_paths() -> None:
        try:
            fut = asyncio.run_coroutine_threadsafe(_persist_gmail_export_stats_only(), loop)
            fut.result(timeout=120)
        except Exception:
            logger.exception("gmail_export_stats_persist_failed job_id=%s", job_id)

    def _on_gmail_list_page(list_resp: dict) -> None:
        est = refine_result_size_estimate_value(
            list_resp.get("resultSizeEstimate"),
            import_content=str(import_content),
            max_messages=int(max_messages),
        )
        if est is None:
            return
        j = service.jobs.get(job_id)
        if j is None:
            return
        try:
            cur = j.get("gmail_messages_total_estimate")
            cur_n = int(cur) if cur is not None else 0
        except (TypeError, ValueError):
            cur_n = 0
        new_v = max(cur_n, int(est))
        if new_v == cur_n:
            return
        j["gmail_messages_total_estimate"] = new_v
        service._save_jobs(force=True)

    async def _forward_drive_batches() -> None:
        try:
            while True:
                batch = await drive_q.get()
                await merge_q.put(("drive", batch))
                if batch is None:
                    break
        except Exception as exc:
            logger.exception("drive_forward_failed job_id=%s", job_id)
            await merge_q.put(("drive_err", str(exc)))

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

    def gmail_producer() -> None:
        try:
            for path, staged_part in iter_gmail_export_file_paths(
                access_token,
                query=gmail_query,
                max_messages=max_messages,
                import_content=import_content,  # type: ignore[arg-type]
                staging_root=gmail_staging_root,
                get_access_token=get_valid_access_token,
                export_stats=export_stats,
                export_stats_lock=export_stats_lock,
                on_message_committed_no_paths=_on_gmail_message_no_paths,
                on_list_page=_on_gmail_list_page,
            ):
                fut = asyncio.run_coroutine_threadsafe(merge_q.put(("gmail_row", (path, staged_part))), loop)
                fut.result(timeout=600)
        except Exception as exc:
            fut = asyncio.run_coroutine_threadsafe(merge_q.put(("gmail_err", str(exc))), loop)
            try:
                fut.result(timeout=60)
            except Exception:
                pass
        finally:
            fut_end = asyncio.run_coroutine_threadsafe(merge_q.put(("gmail_end", None)), loop)
            try:
                fut_end.result(timeout=60)
            except Exception:
                pass

    forward_task: asyncio.Task[None] | None = None
    stream_error: str | None = None

    try:
        # Classify optional local paths first so ordering matches Drive-only streaming.
        if not await _append_and_classify_paths(list(initial_file_paths), from_drive_stream=False):
            forward_task = asyncio.create_task(_forward_drive_batches())
            threading.Thread(target=gmail_producer, name=f"gmail-drive-{job_id[:8]}", daemon=True).start()

        drive_finished = False
        gmail_finished = False

        if not user_aborted and forward_task is not None:
            while (
                not user_aborted
                and not job.get("cancel_requested")
                and not (drive_finished and gmail_finished)
            ):
                if await service.honor_controls(job):
                    user_aborted = True
                    break

                typ, payload = await merge_q.get()

                if typ == "drive":
                    if payload is None:
                        drive_finished = True
                        job["drive_import_fetching"] = False
                        service._save_jobs(force=True)
                    elif await _append_and_classify_paths(payload, from_drive_stream=True):
                        break
                elif typ == "drive_err":
                    stream_error = str(payload)
                    job["error"] = stream_error
                    logger.warning("drive_merge_failed job_id=%s detail=%s", job_id, stream_error[:500])
                    break
                elif typ == "gmail_row":
                    path, staged_part = payload
                    if await service.honor_controls(job):
                        user_aborted = True
                        break
                    row = JobFile(
                        path=path,
                        name=pathlib.Path(path).name,
                        gmail_staged_part=staged_part,
                    ).model_dump()
                    job["files"].append(row)
                    job["total"] = len(job["files"])
                    idx = len(job["files"]) - 1
                    _apply_gmail_export_stats_to_job(job)
                    service._save_jobs(force=True)
                    await pending.analyze_after_append(idx)
                elif typ == "gmail_end":
                    gmail_finished = True
                    job["gmail_import_fetching"] = False
                    _apply_gmail_export_stats_to_job(job)
                    service._save_jobs(force=True)
                elif typ == "gmail_err":
                    stream_error = str(payload)
                    job["error"] = stream_error
                    logger.warning("gmail_merge_failed job_id=%s detail=%s", job_id, stream_error[:500])
                    break
    finally:
        await pending.drain(cancel_first=user_aborted or bool(job.get("cancel_requested")))
        service._drive_stream_queues.pop(job_id, None)
        job["drive_import_fetching"] = False
        job["gmail_import_fetching"] = False
        job["worker_active"] = False
        _apply_gmail_export_stats_to_job(job)
        service._save_jobs(force=True)
        if forward_task is not None and not forward_task.done():
            forward_task.cancel()
            try:
                await forward_task
            except asyncio.CancelledError:
                pass

    if user_aborted or job.get("cancel_requested"):
        cleanup_browser_staging_dir(job)
        service._save_jobs(force=True)
        return

    if stream_error is not None:
        job["phase"] = "awaiting_approval"
        job["status"] = "awaiting_approval"
        service._touch_job(job, job.get("last_processed_index", -1))
        cleanup_browser_staging_dir(job)
        service._save_jobs(force=True)
        return

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
