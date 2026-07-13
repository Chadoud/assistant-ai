"""Gmail import stream worker extracted from JobService."""

from __future__ import annotations

import asyncio
import logging
import pathlib
import threading
from typing import Any

from constants import GMAIL_MESSAGE_FETCH_BATCH_SIZE, GMAIL_MESSAGE_PREFETCH_QUEUE_MAX
from job_models import JobFile
from job_service_stream_analyze import StreamAnalyzePending
from upload_staging import cleanup_browser_staging_dir

logger = logging.getLogger(__name__)


async def run_gmail_import_streaming(
    service: Any,
    job_id: str,
    access_token: str,
    *,
    staging_root: pathlib.Path,
    query: str,
    max_messages: int,
    import_content: str,
    auto_apply: bool,
    runtime: dict,
) -> None:
    from gmail_google_oauth import get_valid_access_token
    from gmail_import import iter_gmail_export_file_paths, refine_result_size_estimate_value

    job = service.jobs.get(job_id)
    if not job:
        return
    job["worker_active"] = True
    job["gmail_import_fetching"] = True
    service._save_jobs(force=True)
    cfg = job["config"]

    loop = asyncio.get_running_loop()
    _gmail_stream_q = max(
        64,
        int(GMAIL_MESSAGE_PREFETCH_QUEUE_MAX) + int(GMAIL_MESSAGE_FETCH_BATCH_SIZE) * 4,
    )
    q: asyncio.Queue[tuple[str, str] | None] = asyncio.Queue(maxsize=_gmail_stream_q)
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

    async def _persist_gmail_import_fetching(active: bool) -> None:
        j = service.jobs.get(job_id)
        if j is not None:
            j["gmail_import_fetching"] = active
        service._save_jobs(force=True)

    def producer() -> None:
        try:
            for path, staged_part in iter_gmail_export_file_paths(
                access_token,
                query=query,
                max_messages=max_messages,
                import_content=import_content,  # type: ignore[arg-type]
                staging_root=staging_root,
                get_access_token=get_valid_access_token,
                export_stats=export_stats,
                export_stats_lock=export_stats_lock,
                on_message_committed_no_paths=_on_gmail_message_no_paths,
                on_list_page=_on_gmail_list_page,
            ):
                fut = asyncio.run_coroutine_threadsafe(q.put((path, staged_part)), loop)
                fut.result(timeout=600)
        except Exception as exc:
            fut = asyncio.run_coroutine_threadsafe(q.put(("__gmail_stream_err__", str(exc))), loop)
            try:
                fut.result(timeout=60)
            except Exception:
                pass
        finally:
            try:
                fut_clear = asyncio.run_coroutine_threadsafe(_persist_gmail_import_fetching(False), loop)
                fut_clear.result(timeout=60)
            except Exception:
                pass
            fut = asyncio.run_coroutine_threadsafe(q.put(None), loop)
            try:
                fut.result(timeout=60)
            except Exception:
                pass

    threading.Thread(target=producer, name=f"gmail-export-{job_id[:8]}", daemon=True).start()

    stream_error: str | None = None
    user_aborted = False
    pending = StreamAnalyzePending(service, job_id, job, cfg, runtime)
    try:
        while True:
            if await service.honor_controls(job):
                user_aborted = True
                break

            item = await q.get()
            if item is None:
                break
            if item[0] == "__gmail_stream_err__":
                stream_error = str(item[1])
                job["error"] = stream_error
                logger.warning("gmail_stream_fetch_failed job_id=%s detail=%s", job_id, stream_error[:500])
                break

            path, staged_part = item
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

            if (idx + 1) % 50 == 0:
                logger.info("gmail_stream_progress job_id=%s files=%s", job_id, idx + 1)

            await pending.analyze_after_append(idx)
    finally:
        await pending.drain(cancel_first=user_aborted or bool(job.get("cancel_requested")))
        _apply_gmail_export_stats_to_job(job)
        job["worker_active"] = False
        job["gmail_import_fetching"] = False
        service._save_jobs(force=True)

    if user_aborted or job.get("cancel_requested"):
        cleanup_browser_staging_dir(job)
        service._save_jobs(force=True)
        return

    if stream_error is None and not job.get("cancel_requested"):
        job["phase"] = "awaiting_approval"
        job["status"] = "awaiting_approval"
        service._touch_job(job, job.get("last_processed_index", -1))
        if auto_apply:
            job["phase"] = "applying"
            job["status"] = "running"
            service._touch_job(job, job.get("last_processed_index", -1))
            await service.apply_files(job_id, False)
    elif stream_error is not None:
        job["phase"] = "awaiting_approval"
        job["status"] = "awaiting_approval"
        service._touch_job(job, job.get("last_processed_index", -1))

    if stream_error is not None or job.get("phase") == "cancelled":
        cleanup_browser_staging_dir(job)
        service._save_jobs(force=True)
