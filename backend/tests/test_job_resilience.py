"""Tests for pause/resume/cancel/retry transitions."""

import pathlib
import sys
import unittest

from fastapi.testclient import TestClient

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import main


class TestJobResilience(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)
        main.jobs.clear()

        main.jobs["job-1"] = {
            "id": "job-1",
            "session_id": "job-1",
            "phase": "analyzing",
            "status": "running",
            "total": 1,
            "completed": 0,
            "last_processed_index": -1,
            "pause_requested": False,
            "cancel_requested": False,
            "worker_active": True,
            "config": {"output_dir": "/tmp", "model": "mistral", "mode": "copy", "language": "English"},
            "files": [],
        }

    def test_pause_resume_cancel_flags(self):
        r1 = self.client.post("/job/job-1/pause")
        self.assertEqual(r1.status_code, 200)
        self.assertTrue(main.jobs["job-1"]["pause_requested"])
        self.assertEqual(main.jobs["job-1"]["status"], "paused")

        r2 = self.client.post("/job/job-1/resume")
        self.assertEqual(r2.status_code, 200)
        self.assertFalse(main.jobs["job-1"]["pause_requested"])
        self.assertEqual(main.jobs["job-1"]["status"], "running")

        r3 = self.client.post("/job/job-1/cancel")
        self.assertEqual(r3.status_code, 200)
        self.assertTrue(main.jobs["job-1"]["cancel_requested"])
        self.assertEqual(main.jobs["job-1"]["status"], "cancelled")


if __name__ == "__main__":
    unittest.main()
