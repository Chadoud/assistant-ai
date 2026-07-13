"""Tests for job sort model resolution."""

import pathlib
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from job_model_resolve import resolve_job_classify_model


class TestResolveJobClassifyModel(unittest.TestCase):
    @patch("job_model_resolve.list_models", return_value=["mistral:latest", "nomic-embed-text"])
    def test_empty_request_uses_default_mistral(self, _list_models):
        self.assertEqual(resolve_job_classify_model(""), "mistral:latest")

    @patch("job_model_resolve.list_models", return_value=["mistral:latest"])
    def test_whitespace_request_uses_default(self, _list_models):
        self.assertEqual(resolve_job_classify_model("   "), "mistral:latest")

    @patch("job_model_resolve.list_models", return_value=["qwen2.5:3b"])
    def test_explicit_preferred_when_installed(self, _list_models):
        self.assertEqual(resolve_job_classify_model("qwen2.5:3b"), "qwen2.5:3b")

    @patch("job_model_resolve.list_models", return_value=[])
    def test_falls_back_to_preferred_when_list_empty(self, _list_models):
        self.assertEqual(resolve_job_classify_model(""), "mistral")
        self.assertEqual(resolve_job_classify_model("m"), "m")

    @patch("job_model_resolve.list_models", return_value=[])
    def test_falls_back_to_default_when_empty_and_list_empty(self, _list_models):
        self.assertEqual(resolve_job_classify_model(None), "mistral")


if __name__ == "__main__":
    unittest.main()
