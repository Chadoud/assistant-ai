"""Smoke tests for streaming import concurrent classify (EXOSITES_SORT_MAX_CONCURRENCY)."""

from __future__ import annotations

import asyncio
import pathlib
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from job_service_stream_analyze import StreamAnalyzePending, parallel_analyze_locks  # noqa: E402


class TestStreamAnalyzeConcurrency(unittest.IsolatedAsyncioTestCase):
    async def test_parallel_analyze_locks_single_vs_many(self) -> None:
        self.assertEqual(parallel_analyze_locks(1), (None, None))
        a, b = parallel_analyze_locks(2)
        self.assertIsNotNone(a)
        self.assertIsNotNone(b)

    async def test_stream_pending_caps_inflight(self) -> None:
        max_seen = [0]
        inflight = [0]

        class Svc:
            async def honor_controls(self, job: dict) -> bool:
                return False

            async def _analyze_one_read_classify_row(self, *_a, **_k) -> None:
                inflight[0] += 1
                max_seen[0] = max(max_seen[0], inflight[0])
                await asyncio.sleep(0.03)
                inflight[0] -= 1

        job = {"files": [{} for _ in range(9)]}
        cfg: dict = {}
        runtime = {
            "existing_folders": [],
            "existing_folders_lower": set(),
            "threshold": 0.5,
            "vision_vm": None,
            "ocr_lang": None,
            "ocr_langs": None,
            "ocr_auto": False,
            "folder_contexts": {},
        }

        with patch("job_service_stream_analyze.effective_sort_max_concurrency", return_value=3):
            pending = StreamAnalyzePending(Svc(), "job-id", job, cfg, runtime)
            self.assertEqual(pending.max_concurrency, 3)
            for idx in range(9):
                await pending.analyze_after_append(idx)
            await pending.drain()

        self.assertLessEqual(max_seen[0], 3)

    async def test_stream_pending_sequential_no_background_tasks(self) -> None:
        calls = []

        class Svc:
            async def honor_controls(self, job: dict) -> bool:
                return False

            async def _analyze_one_read_classify_row(self, job_id: str, idx: int, **_k) -> None:
                calls.append(idx)

        job = {"files": [{} for _ in range(3)]}
        cfg: dict = {}
        runtime = {
            "existing_folders": [],
            "existing_folders_lower": set(),
            "threshold": 0.5,
            "vision_vm": None,
            "ocr_lang": None,
            "ocr_langs": None,
            "ocr_auto": False,
            "folder_contexts": {},
        }

        with patch("job_service_stream_analyze.effective_sort_max_concurrency", return_value=1):
            pending = StreamAnalyzePending(Svc(), "job-id", job, cfg, runtime)
            for idx in range(3):
                await pending.analyze_after_append(idx)
            await pending.drain()

        self.assertEqual(calls, [0, 1, 2])


if __name__ == "__main__":
    unittest.main()
