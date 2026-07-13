"""Gate calibration: tight candidate_margin caps confidence."""

import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from analyze_policy import apply_analyze_gates  # noqa: E402
from constants import (  # noqa: E402
    CONFIDENCE_CAP_WHEN_TIGHT_MARGIN,
    EMPTY_FOLDER,
    EXTRACTION_UNCERTAIN_QUALITY,
    MARGIN_CONFIDENCE_GATE,
    UNCERTAIN_FOLDER,
)


class TestAnalyzePolicyMarginGate(unittest.TestCase):
    def test_tight_margin_caps_confidence_before_threshold(self):
        scored = {
            "folder_name": "Finance/Bank Statements",
            "confidence": 0.95,
            "reason": "ok",
            "candidate_scores": [{"folder_name": "Finance/Bank Statements", "score": 0.3}],
            "llm_confidence": 0.95,
            "rerank_top_score": 0.3,
            "classification_disagree": False,
            "llm_folder_name": "Finance/Bank Statements",
            "candidate_margin": MARGIN_CONFIDENCE_GATE * 0.5,
        }
        gate = apply_analyze_gates(
            scored=scored,
            file_path="/tmp/x.pdf",
            quality_score=0.9,
            low_signal=False,
            existing_folders=["Finance/Bank Statements"],
            existing_folders_lower={"finance/bank statements"},
            threshold=0.5,
            uncertain_folder=UNCERTAIN_FOLDER,
        )
        self.assertLessEqual(gate.confidence, CONFIDENCE_CAP_WHEN_TIGHT_MARGIN + 0.001)
        self.assertEqual(gate.folder_name, "Finance/Bank Statements")

    def test_low_quality_still_routes_to_empty_over_margin(self):
        scored = {
            "folder_name": "Finance/Bank Statements",
            "confidence": 0.95,
            "reason": "ok",
            "candidate_scores": [
                {"folder_name": "Finance/Bank Statements", "score": 0.2},
                {"folder_name": "Uncertain", "score": 0.1},
            ],
            "llm_confidence": 0.95,
            "rerank_top_score": 0.2,
            "classification_disagree": False,
            "llm_folder_name": "Finance/Bank Statements",
            "candidate_margin": 0.2,
        }
        gate = apply_analyze_gates(
            scored=scored,
            file_path="/tmp/x.pdf",
            quality_score=EXTRACTION_UNCERTAIN_QUALITY * 0.5,
            low_signal=False,
            existing_folders=["Finance/Bank Statements"],
            existing_folders_lower={"finance/bank statements"},
            threshold=0.58,
            uncertain_folder=UNCERTAIN_FOLDER,
        )
        self.assertEqual(gate.folder_name, EMPTY_FOLDER)


if __name__ == "__main__":
    unittest.main()
