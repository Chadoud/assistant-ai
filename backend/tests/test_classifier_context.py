"""Tests classifier prompt enrichment with historical context."""

import pathlib
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from classifier import classify


class TestClassifierContext(unittest.TestCase):
    @patch("classifier.ollama.chat")
    def test_includes_historical_context_in_prompt(self, mock_chat):
        mock_chat.return_value = {"message": {"content": "Invoices"}}
        folder_contexts = {
            "Invoices": {
                "file_count": 12,
                "samples": ["Invoice total and due date", "Vendor invoice payment reference"],
                "keywords": ["invoice", "vendor", "payment"],
                "updated_at": 100.0,
            }
        }

        folder = classify(
            text="Q4 invoice 2031 due in 10 days",
            existing_folders=["Invoices", "Legal"],
            folder_contexts=folder_contexts,
            model="mistral",
            language="English",
        )

        self.assertEqual(folder, "Invoices")
        self.assertTrue(mock_chat.called)
        prompt = mock_chat.call_args.kwargs["messages"][1]["content"]
        self.assertIn("Existing folders: Invoices, Legal", prompt)
        self.assertIn("Historical folder context", prompt)
        self.assertIn("keywords: invoice, vendor, payment", prompt)


if __name__ == "__main__":
    unittest.main()
