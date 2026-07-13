"""Multipart ``/analyze-upload`` saves files and runs the same pipeline as ``/analyze``."""

import io
import json
import pathlib
import sys
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import main
from tests.path_helpers import home_safe_tempdir, safe_output_dir_string


class TestAnalyzeUpload(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(main.app)
        main.jobs.clear()

    @patch(
        "main.classify_candidates",
        return_value={
            "folder_name": "Finance",
            "confidence": 0.91,
            "reason": "budget terms",
            "candidate_scores": [{"folder_name": "Finance", "score": 0.91}],
            "decision_reason": "ok",
        },
    )
    @patch(
        "main.extract_content",
        return_value={
            "text": "Q4 budget",
            "extraction_source": "plain_text",
            "quality_score": 0.93,
            "signals": {},
        },
    )
    def test_analyze_upload_multipart(self, _extract_content, _classify_candidates) -> None:
        with home_safe_tempdir() as tmp:
            out_dir = pathlib.Path(tmp) / "out"
            out_dir.mkdir()
            payload = {
                "output_dir": str(out_dir),
                "model": "mistral",
                "mode": "copy",
                "language": "English",
            }
            r = self.client.post(
                "/analyze-upload",
                data={"payload": json.dumps(payload)},
                files=[("files", ("uploaded.txt", io.BytesIO(b"hello from browser"), "text/plain"))],
            )
            self.assertEqual(r.status_code, 200, r.text)
            job_id = r.json()["job_id"]

            job = self.client.get(f"/job/{job_id}")
            self.assertEqual(job.status_code, 200)
            body = job.json()
            self.assertEqual(body["phase"], "awaiting_approval")
            self.assertEqual(len(body["files"]), 1)
            self.assertEqual(body["files"][0]["suggested_folder"], "Finance")
            self.assertTrue(body["files"][0]["path"].endswith("uploaded.txt"))

    def test_analyze_upload_rejects_empty(self) -> None:
        payload = {"output_dir": safe_output_dir_string(), "model": "mistral", "mode": "copy", "language": "English"}
        r = self.client.post(
            "/analyze-upload",
            data={"payload": json.dumps(payload)},
            files=[],
        )
        self.assertEqual(r.status_code, 422)


if __name__ == "__main__":
    unittest.main()
