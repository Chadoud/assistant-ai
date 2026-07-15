"""Relative destination normalization (hierarchical folders under output)."""

import pathlib
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from constants import UNCERTAIN_FOLDER  # noqa: E402
from destination_path import (  # noqa: E402
    destination_dir,
    list_relative_folder_paths_under_output,
    normalize_rel_dest,
    sanitize_folder_segment,
)


class TestDestinationPath(unittest.TestCase):
    def test_flat_segment(self):
        self.assertEqual(normalize_rel_dest("  Invoices  "), "Invoices")

    def test_hierarchical(self):
        self.assertEqual(
            normalize_rel_dest("Career/Job Applications"),
            "Career/Job Applications",
        )

    def test_backslash_normalized(self):
        self.assertEqual(
            normalize_rel_dest(r"Career\Employment Records"),
            "Career/Employment Records",
        )

    def test_rejects_dotdot(self):
        self.assertEqual(normalize_rel_dest("Career/../Bank"), UNCERTAIN_FOLDER)

    def test_collapses_duplicate_slashes(self):
        self.assertEqual(normalize_rel_dest("Career//Bank"), "Career/Bank")

    def test_caps_segments(self):
        parts = ["A", "B", "C", "D"]
        raw = "/".join(parts)
        out = normalize_rel_dest(raw)
        self.assertEqual(out.count("/") + 1, 3)

    def test_destination_dir_joins(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = destination_dir(tmp, "Career/Job Applications")
            self.assertEqual(d, pathlib.Path(tmp).resolve() / "Career" / "Job Applications")

    def test_destination_dir_stays_under_resolved_root(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp).resolve()
            d = destination_dir(tmp, "Career/Job Applications")
            self.assertTrue(d == root or d.is_relative_to(root))
            # Invalid relative paths normalize to uncertain under root
            u = destination_dir(tmp, "../escape")
            self.assertEqual(u, root / UNCERTAIN_FOLDER)

    def test_list_relative_paths_walks_nested(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            (root / "Career" / "Job Applications").mkdir(parents=True)
            (root / "Finance").mkdir()
            rels = list_relative_folder_paths_under_output(tmp)
            self.assertIn("Career", rels)
            self.assertIn("Career/Job Applications", rels)
            self.assertIn("Finance", rels)

    def test_sanitize_segment_strips_illegal(self):
        self.assertNotIn(":", sanitize_folder_segment('bad:name'))

    def test_uncertain_literal_segment_rejected_in_path(self):
        """Using reserved uncertain bucket as a segment is invalid."""
        self.assertEqual(normalize_rel_dest(f"Parent/{UNCERTAIN_FOLDER}"), UNCERTAIN_FOLDER)


if __name__ == "__main__":
    unittest.main()
