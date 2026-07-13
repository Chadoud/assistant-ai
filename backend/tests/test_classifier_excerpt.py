"""Regression tests for classifier excerpt shaping (head + tail for long inputs)."""

import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from classifier import _excerpt_for_classification  # noqa: E402


class TestClassifierExcerpt(unittest.TestCase):
    def test_short_text_unchanged(self):
        t = "Short document about payroll."
        out = _excerpt_for_classification(t, max_len=200)
        self.assertEqual(out, t)

    def test_long_text_head_tail_and_omission(self):
        head = "A" * 80
        middle = "B" * 200
        tail = "C" * 80
        t = head + middle + tail
        max_len = 200
        out = _excerpt_for_classification(t, max_len=max_len)
        self.assertIn("...[middle omitted]...", out)
        self.assertTrue(out.startswith("A"))
        self.assertTrue(out.rstrip().endswith("C"))

    def test_very_small_budget_truncates_prefix(self):
        t = "x" * 500
        out = _excerpt_for_classification(t, max_len=50)
        self.assertEqual(len(out), 50)
        self.assertTrue(out.startswith("x"))

    def test_long_text_includes_middle_window_when_budget_large(self):
        head = "H" * 400
        mid = "M" * 400
        tail = "T" * 400
        t = head + mid + tail + "Z"  # strictly longer than max_len so excerpt path runs
        out = _excerpt_for_classification(t, max_len=1200)
        self.assertGreaterEqual(out.count("...[middle omitted]..."), 2)
        self.assertIn("M", out)
        self.assertTrue(out.startswith("H"))
        self.assertIn("T", out)


if __name__ == "__main__":
    unittest.main()
