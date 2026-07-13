"""Bounded concurrent classify for Gmail/Drive streaming import (same knob as batch analyze)."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from llm.admission import effective_sort_max_concurrency

logger = logging.getLogger(__name__)


def parallel_analyze_locks(max_conc: int) -> tuple[asyncio.Lock | None, asyncio.Lock | None]:
    """Folder list + job progress locks when more than one analyze runs at a time."""
    if max_conc <= 1:
        return None, None
    return asyncio.Lock(), asyncio.Lock()


class StreamAnalyzePending:
    """
    Schedules ``_analyze_one_read_classify_row`` for streaming import: sequential when
    effective sort concurrency is 1, else overlapping classify with a semaphore.
    Call :meth:`drain` before leaving the stream worker so all rows finish before phase changes.
    """

    def __init__(self, service: Any, job_id: str, job: dict, cfg: dict, runtime: dict) -> None:
        self._service = service
        self._job_id = job_id
        self._job = job
        self._cfg = cfg
        self._runtime = runtime
        self._max_conc = effective_sort_max_concurrency()
        self._folder_lock, self._job_progress_lock = parallel_analyze_locks(self._max_conc)
        self._sem: asyncio.Semaphore | None = (
            asyncio.Semaphore(self._max_conc) if self._max_conc > 1 else None
        )
        self._tasks: list[asyncio.Task[None]] = []

    @property
    def max_concurrency(self) -> int:
        return self._max_conc

    async def analyze_after_append(self, idx: int) -> None:
        """Run classify for ``job[\"files\"][idx]`` (await when concurrency is 1, else schedule)."""
        if self._sem is None:
            await self._service._analyze_one_read_classify_row(
                self._job_id,
                idx,
                job=self._job,
                cfg=self._cfg,
                existing_folders=self._runtime["existing_folders"],
                existing_folders_lower=self._runtime["existing_folders_lower"],
                thr=self._runtime["threshold"],
                vision_vm=self._runtime["vision_vm"],
                ocr_lang=self._runtime["ocr_lang"],
                ocr_langs=self._runtime["ocr_langs"],
                ocr_auto=self._runtime["ocr_auto"],
                    folder_contexts=self._runtime["folder_contexts"],
                    folder_lock=None,
                    job_progress_lock=None,
                    structure_contract=self._runtime.get("structure_contract"),
                )
            return

        async def _work() -> None:
            assert self._sem is not None
            async with self._sem:
                if await self._service.honor_controls(self._job):
                    return
                await self._service._analyze_one_read_classify_row(
                    self._job_id,
                    idx,
                    job=self._job,
                    cfg=self._cfg,
                    existing_folders=self._runtime["existing_folders"],
                    existing_folders_lower=self._runtime["existing_folders_lower"],
                    thr=self._runtime["threshold"],
                    vision_vm=self._runtime["vision_vm"],
                    ocr_lang=self._runtime["ocr_lang"],
                    ocr_langs=self._runtime["ocr_langs"],
                    ocr_auto=self._runtime["ocr_auto"],
                    folder_contexts=self._runtime["folder_contexts"],
                    folder_lock=self._folder_lock,
                    job_progress_lock=self._job_progress_lock,
                    structure_contract=self._runtime.get("structure_contract"),
                )

        self._tasks.append(asyncio.create_task(_work()))

    async def drain(self, *, cancel_first: bool = False) -> None:
        """Wait for scheduled tasks; optionally cancel (pause/abort) before waiting."""
        if cancel_first:
            for t in self._tasks:
                if not t.done():
                    t.cancel()
        if not self._tasks:
            return
        results = await asyncio.gather(*self._tasks, return_exceptions=True)
        for r in results:
            if isinstance(r, asyncio.CancelledError):
                continue
            if isinstance(r, BaseException):
                logger.error("stream_analyze_task_failed job_id=%s: %s", self._job_id[:12], r)
        self._tasks.clear()
        if not cancel_first and not self._job.get("cancel_requested"):
            from sort_structure.caps import finalize_structure_caps
            from sort_structure.cluster import finalize_structure_property_clusters
            from sort_structure.reconcile import reconcile_structure_batch

            contract = self._runtime.get("structure_contract") if self._runtime else None
            reconcile_structure_batch(self._job, contract)
            finalize_structure_property_clusters(self._job, contract)
            finalize_structure_caps(self._job)
