"""Smoke tests for parallel batch analyze and folder-append locking."""

from __future__ import annotations

import pathlib
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from constants import UNCERTAIN_FOLDER  # noqa: E402
from job_service import JobService  # noqa: E402


class _FakeContext:
    def folder_names(self):
        return []

    def get_folder_contexts(self):
        return {}


def _job(tmp: pathlib.Path, n: int) -> dict:
    out = tmp / "out"
    out.mkdir()
    files = []
    for i in range(n):
        p = tmp / f"f{i}.txt"
        p.write_text(f"content {i}", encoding="utf-8")
        files.append({"path": str(p), "name": p.name, "status": "pending"})
    cfg = {
        "output_dir": str(out),
        "model": "m",
        "mode": "copy",
        "language": "English",
        "vision_model": None,
        "rules": [],
        "dry_run": False,
        "on_collision": "uniquify",
        "min_confidence": None,
    }
    return {
        "id": "j1",
        "session_id": "s1",
        "phase": "analyzing",
        "status": "running",
        "total": n,
        "completed": 0,
        "last_processed_index": -1,
        "pause_requested": False,
        "cancel_requested": False,
        "worker_active": False,
        "config": cfg,
        "files": files,
    }


class TestAnalyzeThroughputConcurrency(unittest.IsolatedAsyncioTestCase):
    async def test_analyze_files_parallel_finishes_all_rows(self):
        tmp = tempfile.TemporaryDirectory()
        tpath = pathlib.Path(tmp.name)
        try:
            n = 6
            jobs = {"j1": _job(tpath, n)}

            def classify_fn(text: str, *_a, **_k):
                tail = text.strip().split()[-1]
                return {
                    "folder_name": f"Box-{tail}",
                    "confidence": 0.95,
                    "reason": "test",
                    "candidate_scores": [],
                    "decision_reason": "",
                }

            svc = JobService(
                jobs=jobs,
                save_jobs=lambda **k: None,
                touch_job=lambda *a, **k: None,
                context_index=_FakeContext(),
                history=None,
                classify_scored=classify_fn,
                extract_text=lambda p: pathlib.Path(p).read_text(encoding="utf-8"),
                sort_file=lambda *a, **k: None,
                get_folder_tree=lambda d: [],
                uncertain_folder=UNCERTAIN_FOLDER,
                confidence_threshold=0.5,
            )
            with patch("sort_analyze_row.brief_document_for_filing", lambda *a, **k: None):
                with patch("sort_analyze_row.detect_document_language", lambda *a, **k: "English"):
                    with patch("job_service._impl.effective_sort_max_concurrency", return_value=3):
                        await svc.analyze_files("j1", False, False)

            job = jobs["j1"]
            self.assertEqual(job["completed"], n)
            self.assertEqual(job["phase"], "awaiting_approval")
            for f in job["files"]:
                self.assertEqual(f.get("status"), "review_ready")
        finally:
            tmp.cleanup()

    async def test_append_new_folder_name_lock_prevents_duplicate_entries(self):
        """Two concurrent appends of the same new folder must not duplicate list entries."""
        tmp = tempfile.TemporaryDirectory()
        tpath = pathlib.Path(tmp.name)
        try:
            jobs = {"j1": _job(tpath, 1)}
            svc = JobService(
                jobs=jobs,
                save_jobs=lambda **k: None,
                touch_job=lambda *a, **k: None,
                context_index=_FakeContext(),
                history=None,
                classify_scored=lambda *a, **k: {"folder_name": "X", "confidence": 1.0, "reason": ""},
                extract_text=lambda p: "hello",
                sort_file=lambda *a, **k: None,
                get_folder_tree=lambda d: [],
                uncertain_folder=UNCERTAIN_FOLDER,
                confidence_threshold=0.5,
            )
            import asyncio

            folders: list[str] = ["keep"]
            lowers: set[str] = {"keep"}
            lock = asyncio.Lock()

            async def add_dup():
                await svc._append_new_folder_name(
                    "Dup",
                    existing_folders=folders,
                    existing_folders_lower=lowers,
                    folder_lock=lock,
                )

            await asyncio.gather(*(add_dup() for _ in range(32)))
            self.assertEqual(folders.count("Dup"), 1)
        finally:
            tmp.cleanup()


if __name__ == "__main__":
    unittest.main()
