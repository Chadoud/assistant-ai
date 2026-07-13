"""Tests for classifier confidence parsing."""

import pathlib
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from classifier import classify_scored


class TestClassifierConfidence(unittest.TestCase):
    @patch("classifier.ollama.chat")
    def test_parses_json_confidence(self, mock_chat):
        mock_chat.return_value = {
            "message": {"content": '{"folder_name":"Invoices","confidence":0.31,"reason":"Invoice fields detected"}'}
        }
        out = classify_scored("invoice total", ["Invoices"], {}, "mistral", "English")
        self.assertEqual(out["folder_name"], "Invoices")
        self.assertAlmostEqual(out["confidence"], 0.31, places=2)
        self.assertIn("Invoice", out["reason"])

    @patch("classifier.ollama.chat")
    def test_fallback_for_non_json(self, mock_chat):
        mock_chat.return_value = {"message": {"content": "Legal Contracts"}}
        out = classify_scored("nda agreement", ["Legal Contracts"], {}, "mistral", "English")
        self.assertEqual(out["folder_name"], "Legal Contracts")
        self.assertGreaterEqual(out["confidence"], 0.0)
        self.assertLessEqual(out["confidence"], 1.0)


if __name__ == "__main__":
    unittest.main()
