"""Tests for classify folder catalog filtering."""

from __future__ import annotations

import unittest

from folder_catalog import filter_folders_for_classify, is_connector_or_staging_folder


class TestFolderCatalog(unittest.TestCase):
    def test_staging_paths_filtered(self) -> None:
        self.assertTrue(is_connector_or_staging_folder(".exosites_gmail_stream/abc123"))
        self.assertTrue(is_connector_or_staging_folder("foo_sort_staging/bar"))
        self.assertFalse(is_connector_or_staging_folder("Egypt/Bankstatements"))

    def test_filter_removes_staging_from_lists(self) -> None:
        folders = ["Egypt", ".exosites_gmail_stream/abc", "France"]
        contexts = {
            "Egypt": {"keywords": ["egp"]},
            ".exosites_gmail_stream/abc": {"keywords": ["spam"]},
        }
        kept, ctx = filter_folders_for_classify(folders, contexts)
        self.assertEqual(kept, ["Egypt", "France"])
        self.assertNotIn(".exosites_gmail_stream/abc", ctx)


if __name__ == "__main__":
    unittest.main()
