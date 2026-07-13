"""Undo-session restores job to awaiting approval when job_id + session_id match."""

import pathlib
import sys
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import main

_MIN_FILES = [
    {
        "path": "/tmp/in/a.txt",
        "name": "a.txt",
        "status": "done",
        "suggested_folder": "Finance",
        "final_folder": "Finance",
        "confidence": 0.9,
        "reason": None,
        "approved": True,
        "dest_path": "/tmp/out/Finance/a.txt",
        "entry_id": "entry-1",
        "error": None,
        "analysis_excerpt": None,
        "extraction_source": None,
        "extraction_quality": None,
        "extraction_signals": {},
        "candidate_scores": [],
        "decision_reason": None,
        "rule_applied_id": None,
        "llm_confidence": None,
        "rerank_top_score": None,
        "analyze_duration_ms": None,
    }
]

_MIN_CONFIG = {
    "output_dir": "/tmp/out",
    "model": "mistral",
    "mode": "copy",
    "language": "English",
    "vision_model": None,
    "rules": [],
    "dry_run": False,
    "on_collision": "uniquify",
    "min_confidence": None,
    "tesseract_lang": None,
}


class TestUndoSessionJob(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)
        main.jobs.clear()

    @patch.object(main.context_index, "remove_file")
    @patch.object(main.context_index, "save")
    @patch("routes.history_routes.undo_sort", return_value=True)
    def test_undo_session_with_job_id_restores_review(self, _undo, _save, _remove):
        main.jobs["job-1"] = {
            "id": "job-1",
            "session_id": "sess-1",
            "phase": "done",
            "status": "done",
            "total": 1,
            "completed": 1,
            "last_processed_index": 0,
            "pause_requested": False,
            "cancel_requested": False,
            "worker_active": False,
            "error": None,
            "config": _MIN_CONFIG,
            "files": [dict(_MIN_FILES[0])],
        }

        with patch.object(main.history, "get_session_entries") as mock_sess:
            mock_sess.return_value = [
                {
                    "id": "h1",
                    "source_path": "/tmp/in/a.txt",
                    "dest_path": "/tmp/out/Finance/a.txt",
                    "mode": "copy",
                    "folder_name": "Finance",
                    "session_id": "sess-1",
                    "undone": False,
                }
            ]
            r = self.client.post(
                "/undo-session",
                json={"session_id": "sess-1", "job_id": "job-1"},
            )

        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body["job"]["phase"], "awaiting_approval")
        self.assertEqual(body["job"]["status"], "awaiting_approval")
        self.assertEqual(body["job"]["files"][0]["status"], "review_ready")
        self.assertIsNone(body["job"]["files"][0]["dest_path"])
        self.assertIsNone(body["job"]["files"][0]["entry_id"])

    def test_undo_session_wrong_session_skips_job_reset(self):
        main.jobs["job-1"] = {
            "id": "job-1",
            "session_id": "other-sess",
            "phase": "done",
            "status": "done",
            "total": 1,
            "completed": 1,
            "last_processed_index": 0,
            "pause_requested": False,
            "cancel_requested": False,
            "worker_active": False,
            "error": None,
            "config": _MIN_CONFIG,
            "files": [dict(_MIN_FILES[0])],
        }

        with patch.object(main.history, "get_session_entries", return_value=[]):
            with patch.object(main.context_index, "save"):
                r = self.client.post(
                    "/undo-session",
                    json={"session_id": "sess-1", "job_id": "job-1"},
                )

        self.assertEqual(r.status_code, 200)
        self.assertIsNone(r.json().get("job"))
        self.assertEqual(main.jobs["job-1"]["phase"], "done")


if __name__ == "__main__":
    unittest.main()
