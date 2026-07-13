"""Tests for classify_eval.summarize_export CSV summarizer."""

import csv
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from classify_eval.summarize_export import summarize  # noqa: E402

_FIXTURE_CSV = (
    pathlib.Path(__file__).resolve().parents[1]
    / "classify_eval"
    / "fixtures"
    / "baseline_sort_plan.csv"
)
_FIXTURE_GOLD = (
    pathlib.Path(__file__).resolve().parents[1]
    / "classify_eval"
    / "fixtures"
    / "gold_labels.baseline_fixture.json"
)


class TestSummarizeExport(unittest.TestCase):
    def test_automation_and_reasons(self):
        rows = [
            {"target_folder": "Uncertain", "reason": "Ambiguous", "filename": "a.pdf"},
            {"target_folder": "HR", "reason": "ok", "filename": "b.pdf"},
        ]
        s = summarize(rows, None)
        self.assertEqual(s["rows"], 2)
        self.assertAlmostEqual(s["automation_rate"], 0.5)
        self.assertIn("Ambiguous", s["reason_histogram"])

    def test_safety_with_gold(self):
        gold = [{"match": "*.pdf", "gold_folder": "HR"}]
        rows = [
            {"target_folder": "HR", "reason": "x", "filename": "doc.pdf"},
            {"target_folder": "Uncertain", "reason": "y", "filename": "other.pdf"},
        ]
        s = summarize(rows, gold)
        self.assertEqual(s.get("safety_pairs"), "1/1")

    def test_extraction_breakdown(self):
        rows = [
            {
                "target_folder": "HR",
                "reason": "",
                "filename": "a.pdf",
                "extraction_source": "pdf_text",
                "extraction_quality": "0.9",
            },
            {
                "target_folder": "Uncertain",
                "reason": "Low",
                "filename": "b.pdf",
                "extraction_source": "pdf_ocr",
                "extraction_quality": "0.2",
            },
        ]
        s = summarize(rows, None, include_extraction_breakdown=True)
        self.assertIn("extraction_source_histogram", s)
        self.assertEqual(s["extraction_source_histogram"]["pdf_text"], 1)
        self.assertEqual(s["extraction_source_histogram"]["pdf_ocr"], 1)
        self.assertIn("extraction_quality_bucket_histogram", s)

    def test_fixture_csv_baseline(self):
        self.assertTrue(_FIXTURE_CSV.is_file(), msg="missing baseline_sort_plan.csv fixture")
        with _FIXTURE_CSV.open(newline="", encoding="utf-8-sig") as f:
            rows = list(csv.DictReader(f))
        import json

        gold = json.loads(_FIXTURE_GOLD.read_text(encoding="utf-8"))
        s = summarize(rows, gold, include_extraction_breakdown=True)
        self.assertEqual(s["rows"], 4)
        self.assertAlmostEqual(s["automation_rate"], 0.75)
        self.assertEqual(s.get("safety_pairs"), "2/2")
        self.assertEqual(s["extraction_source_histogram"]["pdf_text"], 1)
        self.assertEqual(s["extraction_source_histogram"]["pdf_ocr"], 1)
        self.assertEqual(s["extraction_source_histogram"]["image_vision"], 1)
        self.assertEqual(s["extraction_source_histogram"]["plain_text"], 1)


if __name__ == "__main__":
    unittest.main()
