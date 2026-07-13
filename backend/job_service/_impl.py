"""Job orchestration service for analyze/apply lifecycle."""

from __future__ import annotations

import asyncio
import logging
import pathlib
import time
from typing import Callable

from cloud_sort.client import remote_sort_analyze_file
from cloud_sort.config import cloud_sort_worker_enabled, cloud_sort_worker_url
from constants import (
    PAUSE_POLL_SECONDS,
)
from destination_path import list_relative_folder_paths_under_output, normalize_rel_dest
from job_service_analyze_runtime import prepare_analyze_runtime
from job_service_drive_gmail_stream import run_drive_and_gmail_import_streaming
from job_service_drive_stream import run_drive_import_streaming as run_drive_import_streaming_worker
from job_service_gmail_stream import run_gmail_import_streaming as run_gmail_import_streaming_worker
from job_service_ndjson import append_job_pipeline_event_ndjson
from job_service_stream_analyze import parallel_analyze_locks
from llm.admission import effective_sort_max_concurrency
from sort_analyze_row import SortAnalyzeParams, run_sort_analyze_for_path
from sort_structure.caps import finalize_structure_caps
from sort_structure.cluster import finalize_structure_property_clusters
from sorter import ensure_output_root, resolve_destination_path
from upload_staging import cleanup_browser_staging_dir
from user_facing_errors import sanitize_user_facing_error

from .analyze_support import log_analyze_phase_timing

logger = logging.getLogger(__name__)


class JobService:
    def __init__(
        self,
        *,
        jobs: dict[str, dict],
        save_jobs: Callable[..., None],
        touch_job: Callable[..., None],
        context_index,
        history,
        classify_scored,
        classify_candidates=None,
        extract_text,
        extract_content=None,
        sort_file,
        get_folder_tree,
        uncertain_folder: str,
        confidence_threshold: float,
    ) -> None:
        self.jobs = jobs
        self._save_jobs = save_jobs
        self._touch_job = touch_job
        self.context_index = context_index
        self.history = history
        self.classify_scored = classify_scored
        self.classify_candidates = classify_candidates
        self.extract_text = extract_text
        self.extract_content = extract_content
        self.sort_file = sort_file
        self.get_folder_tree = get_folder_tree
        self.uncertain_folder = uncertain_folder
        self.confidence_threshold = confidence_threshold
        # Progressive Drive: client coroutine appends path batches; worker waits here (per-job queue).
        self._drive_stream_queues: dict[str, asyncio.Queue[list[str] | None]] = {}

    def signal_drive_stream_ended(self, job_id: str) -> None:
        """Unblock :meth:`run_drive_import_streaming` (cancel, or client finished without sending ``ended``)."""
        q = self._drive_stream_queues.get(job_id)
        if q is None:
            return
        try:
            q.put_nowait(None)
        except asyncio.QueueFull:
            logger.warning("drive_stream_queue_full job_id=%s", job_id)

    def drive_stream_queue(self, job_id: str) -> asyncio.Queue[list[str] | None] | None:
        """Queue used by the progressive Drive path (or ``None`` if the job is not streaming)."""
        return self._drive_stream_queues.get(job_id)

    def prepare_drive_stream_queue(self, job_id: str) -> None:
        """
        Create the per-job stream queue before ``run_drive_import_streaming`` runs (avoids a race
        with the first ``POST /job/.../drive-stream-chunk`` on fast clients).
        """
        if job_id not in self._drive_stream_queues:
            self._drive_stream_queues[job_id] = asyncio.Queue(maxsize=256)

    def seed_existing_folders(self, output_dir: str) -> list[str]:
        names: set[str] = set()
        try:
            for rel in list_relative_folder_paths_under_output(output_dir):
                if rel.strip():
                    names.add(rel.strip())
        except Exception as exc:
            logger.warning("seed_existing_folders: could not list output directory %r: %s", output_dir, exc)
        for name in self.context_index.folder_names():
            if isinstance(name, str) and name.strip():
                names.add(normalize_rel_dest(name.strip()))
        return sorted(names)

    async def _touch_job_started_row(
        self,
        job: dict,
        idx: int,
        job_progress_lock: asyncio.Lock | None,
    ) -> None:
        """Update ``last_processed_index`` with max semantics when concurrent analyze tasks overlap."""
        if job_progress_lock is not None:
            async with job_progress_lock:
                lip = max(int(job.get("last_processed_index") or -1), idx)
                job["last_processed_index"] = lip
                self._touch_job(job, lip)
        else:
            self._touch_job(job, idx)

    async def _record_row_analyzed(
        self,
        job: dict,
        idx: int,
        job_progress_lock: asyncio.Lock | None,
    ) -> None:
        """Increment ``completed`` and persist touch after one row finishes analyze (success or error)."""
        if job_progress_lock is not None:
            async with job_progress_lock:
                job["completed"] = int(job.get("completed") or 0) + 1
                lip = max(int(job.get("last_processed_index") or -1), idx)
                job["last_processed_index"] = lip
                self._touch_job(job, lip)
        else:
            job["completed"] = int(job.get("completed") or 0) + 1
            lip = max(int(job.get("last_processed_index") or -1), idx)
            job["last_processed_index"] = lip
            self._touch_job(job, lip)

    async def _append_new_folder_name(
        self,
        folder_name: str,
        *,
        existing_folders: list[str],
        existing_folders_lower: set[str],
        folder_lock: asyncio.Lock | None,
    ) -> None:
        if folder_name == self.uncertain_folder:
            return

        def apply() -> None:
            if folder_name not in existing_folders:
                existing_folders.append(folder_name)
                existing_folders_lower.add(folder_name.strip().lower())

        if folder_lock is not None:
            async with folder_lock:
                apply()
        else:
            apply()

    async def _analyze_one_read_classify_row(
        self,
        job_id: str,
        idx: int,
        *,
        job: dict,
        cfg: dict,
        existing_folders: list[str],
        existing_folders_lower: set[str],
        thr: float,
        vision_vm,
        ocr_lang: str | None,
        ocr_langs: list[str] | None,
        ocr_auto: bool,
        folder_contexts,
        folder_lock: asyncio.Lock | None = None,
        job_progress_lock: asyncio.Lock | None = None,
        structure_contract=None,
    ) -> None:
        """Extract + classify one file row; updates ``job["completed"]`` once finished."""
        file_row = job["files"][idx]
        file_row["status"] = "reading"
        await self._touch_job_started_row(job, idx, job_progress_lock)
        t_analyze = time.perf_counter()
        extract_ms_val: float | None = None
        briefing_ms_val = 0.0
        classify_ms_val: float | None = None
        want_briefing_flag = False
        skip_plain_flag = False
        extraction_src: str | None = None
        text_chars = 0
        analyze_err: str | None = None
        try:
            classify_fn = self.classify_candidates or self.classify_scored
            src_name = ""
            if isinstance(file_row.get("name"), str) and file_row["name"].strip():
                src_name = file_row["name"].strip()
            else:
                src_name = pathlib.Path(str(file_row["path"])).name
            gsp = file_row.get("gmail_staged_part")
            params = SortAnalyzeParams(
                file_path=str(file_row["path"]),
                cfg=cfg,
                existing_folders=existing_folders,
                existing_folders_lower=existing_folders_lower,
                folder_contexts=folder_contexts,
                threshold=thr,
                uncertain_folder=self.uncertain_folder,
                vision_vm=vision_vm,
                ocr_lang=ocr_lang,
                ocr_langs=ocr_langs,
                ocr_auto=ocr_auto,
                structure_contract=structure_contract,
                extract_content=self.extract_content,
                classify_fn=classify_fn,
                source_filename=src_name or None,
                gmail_staged_part=gsp if isinstance(gsp, str) else None,
                job_id=job_id,
            )
            t_analyze_pipeline = time.perf_counter()
            use_cloud_worker = (
                cloud_sort_worker_enabled()
                and cloud_sort_worker_url()
                and not (structure_contract and getattr(structure_contract, "levels", None))
            )
            if use_cloud_worker:
                result = await asyncio.to_thread(remote_sort_analyze_file, params)
            elif self.extract_content is not None:
                result = await asyncio.to_thread(run_sort_analyze_for_path, params)
            else:
                text = await asyncio.to_thread(self.extract_text, file_row["path"])
                params_legacy = SortAnalyzeParams(
                    file_path=str(file_row["path"]),
                    cfg=cfg,
                    existing_folders=existing_folders,
                    existing_folders_lower=existing_folders_lower,
                    folder_contexts=folder_contexts,
                    threshold=thr,
                    uncertain_folder=self.uncertain_folder,
                    vision_vm=vision_vm,
                    ocr_lang=ocr_lang,
                    ocr_langs=ocr_langs,
                    ocr_auto=ocr_auto,
                    structure_contract=structure_contract,
                    extract_content=lambda path, *_a, **_k: {
                        "text": text,
                        "extraction_source": "legacy_text",
                        "quality_score": 0.5,
                        "signals": {},
                    },
                    classify_fn=classify_fn,
                    source_filename=src_name or None,
                    gmail_staged_part=gsp if isinstance(gsp, str) else None,
                    job_id=job_id,
                )
                result = await asyncio.to_thread(run_sort_analyze_for_path, params_legacy)

            pipeline_ms = (time.perf_counter() - t_analyze_pipeline) * 1000.0
            want_briefing_flag = result.want_briefing
            skip_plain_flag = result.skip_plain_briefing
            extract_ms_val = result.analyze_extract_ms
            briefing_ms_val = result.analyze_briefing_ms
            classify_ms_val = result.analyze_classify_ms
            extraction_src = result.extraction_source
            text_chars = len(result.analysis_excerpt or "")
            analyze_err = result.error

            file_row.update(result.as_file_row_patch())
            if not result.ok:
                logger.error(
                    "analyze_file_error job_id=%s path=%r err=%s",
                    job_id,
                    str(file_row.get("path", "")),
                    result.error,
                )
                append_job_pipeline_event_ndjson(
                    job_id=job_id,
                    file_path=str(file_row.get("path", "")),
                    phase=str(job.get("phase")),
                    event="analyze_file_error",
                    error=str(result.error or "unknown"),
                )
            elif result.new_folder_name:
                await self._append_new_folder_name(
                    result.new_folder_name,
                    existing_folders=existing_folders,
                    existing_folders_lower=existing_folders_lower,
                    folder_lock=folder_lock,
                )
            if extract_ms_val is None and pipeline_ms:
                extract_ms_val = pipeline_ms
        except Exception as exc:
            analyze_err = sanitize_user_facing_error(str(exc))
            file_row["status"] = "error"
            file_row["error"] = analyze_err
            logger.exception(
                "analyze_file_error job_id=%s path=%r",
                job_id,
                str(file_row.get("path", "")),
            )
            append_job_pipeline_event_ndjson(
                job_id=job_id,
                file_path=str(file_row.get("path", "")),
                phase=str(job.get("phase")),
                event="analyze_file_error",
                error=f"{type(exc).__name__}: {exc}",
            )
        finally:
            wall_ms = (time.perf_counter() - t_analyze) * 1000.0
            file_row["analyze_duration_ms"] = round(wall_ms, 1)
            if extract_ms_val is not None:
                file_row["analyze_extract_ms"] = round(extract_ms_val, 1)
            file_row["analyze_briefing_ms"] = round(briefing_ms_val, 1)
            if classify_ms_val is not None:
                file_row["analyze_classify_ms"] = round(classify_ms_val, 1)
            log_analyze_phase_timing(
                job_id=job_id,
                idx=idx,
                file_row=file_row,
                cfg=cfg,
                extract_ms=extract_ms_val,
                briefing_ms=briefing_ms_val,
                classify_ms=classify_ms_val,
                wall_ms=wall_ms,
                extraction_source=extraction_src,
                text_chars=text_chars,
                want_briefing=want_briefing_flag,
                skip_plain=skip_plain_flag,
                error=analyze_err,
            )

        await self._record_row_analyzed(job, idx, job_progress_lock)

    async def analyze_files(self, job_id: str, retry_failed_only: bool, auto_apply: bool) -> None:
        job = self.jobs.get(job_id)
        if not job:
            logger.warning("analyze_files: unknown job_id=%s — ignoring", job_id)
            return
        job["worker_active"] = True
        self._save_jobs(force=True)
        cfg = job["config"]
        runtime = await prepare_analyze_runtime(self, cfg)

        job["completed"] = 0
        indices: list[int] = []
        for idx, file_row in enumerate(job["files"]):
            if retry_failed_only and file_row.get("status") != "error":
                continue
            if file_row.get("status") in {"review_ready", "done"} and not retry_failed_only:
                continue
            indices.append(idx)

        max_conc = effective_sort_max_concurrency()
        folder_lock, job_progress_lock = parallel_analyze_locks(max_conc)
        lock_iter = asyncio.Lock()
        idx_iter = iter(indices)

        async def _analyze_worker() -> None:
            while True:
                if await self.honor_controls(job):
                    return
                async with lock_iter:
                    try:
                        idx = next(idx_iter)
                    except StopIteration:
                        return
                await self._analyze_one_read_classify_row(
                    job_id,
                    idx,
                    job=job,
                    cfg=cfg,
                    existing_folders=runtime["existing_folders"],
                    existing_folders_lower=runtime["existing_folders_lower"],
                    thr=runtime["threshold"],
                    vision_vm=runtime["vision_vm"],
                    ocr_lang=runtime["ocr_lang"],
                    ocr_langs=runtime["ocr_langs"],
                    ocr_auto=runtime["ocr_auto"],
                    folder_contexts=runtime["folder_contexts"],
                    folder_lock=folder_lock,
                    job_progress_lock=job_progress_lock,
                    structure_contract=runtime.get("structure_contract"),
                )

        if indices:
            await asyncio.gather(*(_analyze_worker() for _ in range(min(max_conc, len(indices)))))

        if not job.get("cancel_requested"):
            runtime_contract = runtime.get("structure_contract")
            from sort_structure.reconcile import reconcile_structure_batch

            reconcile_structure_batch(job, runtime_contract)
            finalize_structure_property_clusters(job, runtime_contract)
            finalize_structure_caps(job)

        try:
            if job.get("cancel_requested"):
                job["phase"] = "cancelled"
                job["status"] = "cancelled"
            else:
                job["phase"] = "awaiting_approval"
                job["status"] = "awaiting_approval"
            self._touch_job(job, job.get("last_processed_index", -1))

            if auto_apply and not job.get("cancel_requested"):
                job["phase"] = "applying"
                job["status"] = "running"
                self._touch_job(job, job.get("last_processed_index", -1))
                await self.apply_files(job_id, False)
        finally:
            job["worker_active"] = False
            self._save_jobs(force=True)
            if job.get("phase") == "cancelled":
                cleanup_browser_staging_dir(job)
                self._save_jobs(force=True)

    async def run_gmail_import_streaming(
        self,
        job_id: str,
        access_token: str,
        *,
        staging_root: pathlib.Path,
        query: str,
        max_messages: int,
        import_content: str,
        auto_apply: bool,
    ) -> None:
        """
        Gmail ``import-sort``: fetch each staged file from Gmail in a background thread while this
        coroutine classifies rows as paths arrive (bounded queue for backpressure).
        """
        job = self.jobs.get(job_id)
        if not job:
            logger.warning("analyze_gmail_stream: unknown job_id=%s — ignoring", job_id)
            return
        cfg = job["config"]
        runtime = await prepare_analyze_runtime(self, cfg)
        await run_gmail_import_streaming_worker(
            self,
            job_id,
            access_token,
            staging_root=staging_root,
            query=query,
            max_messages=max_messages,
            import_content=import_content,
            auto_apply=auto_apply,
            runtime=runtime,
        )

    async def run_drive_import_streaming(
        self,
        job_id: str,
        *,
        auto_apply: bool,
        initial_file_paths: list[str],
        gmail_query: str | None = None,
        max_messages: int | None = None,
        gmail_import_content: str | None = None,
        access_token: str | None = None,
        gmail_staging_root: pathlib.Path | None = None,
    ) -> None:
        """
        Progressive Drive import → sort: the renderer lists/imports in waves and posts local paths
        in batches. This coroutine classifies each file as batches arrive (bounded queue for backpressure).
        When Gmail kwargs are set, Gmail export runs in parallel with Drive chunks in one pipeline.
        """
        job = self.jobs.get(job_id)
        if not job:
            return
        cfg = job["config"]
        runtime = await prepare_analyze_runtime(self, cfg)
        if (
            gmail_query is not None
            and max_messages is not None
            and gmail_import_content is not None
            and access_token
            and gmail_staging_root is not None
        ):
            await run_drive_and_gmail_import_streaming(
                self,
                job_id,
                auto_apply=auto_apply,
                initial_file_paths=initial_file_paths,
                runtime=runtime,
                access_token=access_token,
                gmail_staging_root=gmail_staging_root,
                gmail_query=gmail_query,
                max_messages=max_messages,
                import_content=gmail_import_content,
            )
        else:
            await run_drive_import_streaming_worker(
                self,
                job_id,
                auto_apply=auto_apply,
                initial_file_paths=initial_file_paths,
                runtime=runtime,
            )

    async def apply_files(self, job_id: str, retry_failed_only: bool) -> None:
        job = self.jobs.get(job_id)
        if not job:
            logger.warning("apply_files: unknown job_id=%s — ignoring", job_id)
            return
        job["worker_active"] = True
        self._save_jobs(force=True)
        cfg = job["config"]
        await asyncio.to_thread(ensure_output_root, cfg["output_dir"])
        processed = 0

        for idx, file_row in enumerate(job["files"]):
            approved = bool(file_row.get("approved", True))
            if not approved:
                continue
            if retry_failed_only and file_row.get("status") != "error":
                continue
            if file_row.get("status") == "done" and not retry_failed_only:
                continue
            if await self.honor_controls(job):
                return

            try:
                file_row["status"] = "applying"
                self._touch_job(job, idx)
                folder = file_row.get("final_folder") or file_row.get("suggested_folder") or self.uncertain_folder
                collision = cfg.get("on_collision") or "uniquify"
                if cfg.get("dry_run"):
                    dest = await asyncio.to_thread(
                        resolve_destination_path,
                        file_row["path"],
                        cfg["output_dir"],
                        folder,
                        on_collision=collision,
                    )
                    file_row["dest_path"] = dest
                    file_row["entry_id"] = None
                    file_row["status"] = "done"
                    file_row["error"] = None
                    processed += 1
                else:
                    dest = await asyncio.to_thread(
                        self.sort_file,
                        file_row["path"],
                        cfg["output_dir"],
                        folder,
                        cfg["mode"],
                        on_collision=collision,
                    )
                    file_row["dest_path"] = dest
                    entry_id = self.history.record(file_row["path"], dest, folder, cfg["mode"], job["session_id"])
                    file_row["entry_id"] = entry_id
                    excerpt = file_row.get("analysis_excerpt") or ""
                    self.context_index.update_with_classification(folder, excerpt, dest)
                    file_row["status"] = "done"
                    file_row["error"] = None
                    processed += 1
                    if processed % 10 == 0:
                        self.context_index.save()
            except Exception as exc:
                file_row["status"] = "error"
                file_row["error"] = str(exc)
                processed += 1
                logger.exception(
                    "apply_file_error job_id=%s path=%r",
                    job_id,
                    str(file_row.get("path", "")),
                )
                append_job_pipeline_event_ndjson(
                    job_id=job_id,
                    file_path=str(file_row.get("path", "")),
                    phase=str(job.get("phase")),
                    event="apply_file_error",
                    error=f"{type(exc).__name__}: {exc}",
                )

            job["completed"] = processed
            self._touch_job(job, idx)

        try:
            self.context_index.save()
            if job.get("cancel_requested"):
                job["phase"] = "cancelled"
                job["status"] = "cancelled"
            else:
                job["phase"] = "done"
                job["status"] = "done"
            self._touch_job(job, job.get("last_processed_index", -1))
        finally:
            job["worker_active"] = False
            self._save_jobs(force=True)
            cleanup_browser_staging_dir(job)

    async def honor_controls(self, job: dict) -> bool:
        if job.get("cancel_requested"):
            job["phase"] = "cancelled"
            job["status"] = "cancelled"
            self._touch_job(job, job.get("last_processed_index", -1))
            return True

        while job.get("pause_requested"):
            job["phase"] = "paused"
            job["status"] = "paused"
            self._touch_job(job, job.get("last_processed_index", -1))
            if job.get("cancel_requested"):
                job["phase"] = "cancelled"
                job["status"] = "cancelled"
                self._touch_job(job, job.get("last_processed_index", -1))
                return True
            await asyncio.sleep(PAUSE_POLL_SECONDS)
        return False

