"""Voice sort entry — remote vs local model gates."""

from __future__ import annotations

import unittest
from pathlib import Path
from unittest.mock import patch

from actions import start_local_sort

_SAMPLE_PATH = str(Path.home() / "Documents" / "a.pdf")


class StartLocalSortModelGateTests(unittest.TestCase):
    @patch("actions.start_local_sort.health_check", return_value={"ok": True})
    @patch("actions.start_local_sort.resolve_job_classify_model", return_value="mistral-nemo")
    @patch("actions.start_local_sort.is_remote_mode", return_value=True)
    def test_remote_mode_uses_gateway_model_without_local_ollama(
        self, _remote, _resolve, _health
    ):
        with patch("actions.start_local_sort.get_voice_job_enqueue_runtime") as runtime:
            runtime.side_effect = RuntimeError("not wired in unit test")
            result = start_local_sort.start_local_file_sort({"file_paths": [_SAMPLE_PATH]})
        self.assertFalse(result["ok"])
        self.assertNotIn("No local AI model", result["error"])

    @patch("actions.start_local_sort.list_models", return_value=[])
    @patch("actions.start_local_sort.is_remote_mode", return_value=False)
    def test_local_mode_requires_installed_model(self, _remote, _models):
        result = start_local_sort.start_local_file_sort({"file_paths": [_SAMPLE_PATH]})
        self.assertFalse(result["ok"])
        self.assertIn("No local AI model", result["error"])

    @patch("actions.start_local_sort.health_check", return_value={"ok": False, "detail": "timeout"})
    @patch("actions.start_local_sort.resolve_job_classify_model", return_value="mistral")
    @patch("actions.start_local_sort.is_remote_mode", return_value=True)
    def test_remote_mode_reports_cloud_error_when_gateway_down(
        self, _remote, _resolve, _health
    ):
        result = start_local_sort.start_local_file_sort({"file_paths": [_SAMPLE_PATH]})
        self.assertFalse(result["ok"])
        self.assertIn("Cloud sort isn't connected", result["error"])


if __name__ == "__main__":
    unittest.main()
