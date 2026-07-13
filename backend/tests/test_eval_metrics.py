"""Tests for classify_eval.eval_metrics (no Ollama)."""

import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from classify_eval.eval_metrics import (  # noqa: E402
    compute_eval_metrics,
    confusion_from_csv_rows,
    margin_histogram_from_csv,
)


class TestEvalMetrics(unittest.TestCase):
    def test_compute_eval_metrics_accuracy_and_confusion(self):
        rows = [
            {"pred": "A", "gold": "A", "margin": 0.1},
            {"pred": "B", "gold": "C", "margin": 0.02},
            {"pred": "B", "gold": "C", "margin": 0.03},
        ]
        m = compute_eval_metrics(rows)
        self.assertEqual(m["labeled_count"], 3)
        self.assertEqual(m["top1_correct"], 1)
        self.assertAlmostEqual(m["top1_accuracy"], 1 / 3, places=5)
        self.assertEqual(m["confusion_pairs"][0]["pred"], "B")
        self.assertEqual(m["confusion_pairs"][0]["gold"], "C")
        self.assertEqual(m["confusion_pairs"][0]["count"], 2)

    def test_confusion_from_csv_rows(self):
        rows = [
            {"suggested_folder": "X", "target_folder": "Y"},
            {"suggested_folder": "X", "target_folder": "Y"},
        ]
        c = confusion_from_csv_rows(rows)
        self.assertEqual(c["pred_vs_gold_top"][0]["count"], 2)

    def test_margin_histogram(self):
        rows = [
            {"candidate_margin_top12": "0.05"},
            {"candidate_margin_top12": "0.15"},
        ]
        h = margin_histogram_from_csv(rows)
        self.assertIsNotNone(h)
        assert h is not None
        self.assertEqual(h.get("n"), 2)


if __name__ == "__main__":
    unittest.main()
