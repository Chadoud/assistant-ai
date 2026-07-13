"""Tests for analyze -> review -> apply flow."""

import pathlib
import sys
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import main
from tests.path_helpers import home_safe_tempdir


class TestAnalyzeApplyFlow(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)
        main.jobs.clear()

    @patch("main.history.record", return_value="entry-1")
    @patch("main.sort_file", return_value="/tmp/out/Finance/a.txt")
    @patch(
        "main.classify_candidates",
        return_value={
            "folder_name": "Finance",
            "confidence": 0.91,
            "reason": "budget terms",
            "candidate_scores": [{"folder_name": "Finance", "score": 0.91}, {"folder_name": "Uncertain", "score": 0.12}],
            "decision_reason": "Finance selected by margin",
        },
    )
    @patch(
        "main.extract_content",
        return_value={
            "text": "Q4 budget and invoice details",
            "extraction_source": "plain_text",
            "quality_score": 0.93,
            "signals": {"ocr_used": False, "filename_tokens": ["budget"]},
        },
    )
    def test_analyze_then_apply(self, _extract_content, _classify_candidates, _sort, _record):
        with home_safe_tempdir() as tmp:
            in_dir = pathlib.Path(tmp) / "in"
            out_dir = pathlib.Path(tmp) / "out"
            in_dir.mkdir()
            out_dir.mkdir()
            src = in_dir / "a.txt"
            src.write_text("hello", encoding="utf-8")

            start = self.client.post(
                "/analyze",
                json={
                    "file_paths": [str(src)],
                    "output_dir": str(out_dir),
                    "model": "mistral",
                    "mode": "copy",
                    "language": "English",
                },
            )
            self.assertEqual(start.status_code, 200)
            job_id = start.json()["job_id"]

            job = self.client.get(f"/job/{job_id}")
            self.assertEqual(job.status_code, 200)
            payload = job.json()
            self.assertEqual(payload["phase"], "awaiting_approval")
            self.assertEqual(payload["files"][0]["suggested_folder"], "Finance")
            self.assertEqual(payload["files"][0]["extraction_source"], "plain_text")
            self.assertGreater(payload["files"][0]["extraction_quality"], 0.8)

            apply = self.client.post(
                "/apply",
                json={
                    "job_id": job_id,
                    "items": [{"path": str(src), "approved": True, "folder": "Finance"}],
                },
            )
            self.assertEqual(apply.status_code, 200)

            final_job = self.client.get(f"/job/{job_id}").json()
            self.assertEqual(final_job["phase"], "done")
            self.assertEqual(final_job["files"][0]["status"], "done")
            self.assertEqual(final_job["files"][0]["entry_id"], "entry-1")


if __name__ == "__main__":
    unittest.main()
