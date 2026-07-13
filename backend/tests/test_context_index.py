"""Tests for persistent ContextIndex behavior."""

import pathlib
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from context_index import ContextIndex


class TestContextIndex(unittest.TestCase):
    def test_update_persist_and_reload(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "context.json"
            idx = ContextIndex(str(path))
            idx.update_with_classification("Invoices", "Invoice number 2024-88 total due", "/out/Invoices/a.pdf")
            idx.save()

            idx2 = ContextIndex(str(path))
            contexts = idx2.get_folder_contexts()
            self.assertIn("Invoices", contexts)
            self.assertGreaterEqual(contexts["Invoices"]["file_count"], 1)
            self.assertTrue(contexts["Invoices"]["samples"])
            self.assertIn("profile", contexts["Invoices"])
            self.assertEqual(contexts["Invoices"]["profile"], "")

    def test_reassign_and_remove(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "context.json"
            idx = ContextIndex(str(path))
            idx.update_with_classification("Invoices", "payment terms and invoice", "/out/Invoices/x.pdf")
            idx.update_with_classification("Invoices", "vendor billing details", "/out/Invoices/y.pdf")

            idx.reassign_file("Invoices", "Accounting", "/out/Invoices/x.pdf", "/out/Accounting/x.pdf")
            c = idx.get_folder_contexts()
            self.assertIn("Accounting", c)
            self.assertEqual(c["Accounting"]["file_count"], 1)
            self.assertEqual(c["Invoices"]["file_count"], 1)

            idx.remove_file("Invoices", "/out/Invoices/y.pdf")
            c2 = idx.get_folder_contexts()
            self.assertNotIn("Invoices", c2)

    def test_set_folder_profile_persisted(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "context.json"
            idx = ContextIndex(str(path))
            idx.set_folder_profile("Finance/Bank Statements", "Personal UBS and card PDFs")
            idx.save()
            idx2 = ContextIndex(str(path))
            ctx = idx2.get_folder_contexts()
            self.assertEqual(
                ctx["Finance/Bank Statements"]["profile"],
                "Personal UBS and card PDFs",
            )


if __name__ == "__main__":
    unittest.main()
