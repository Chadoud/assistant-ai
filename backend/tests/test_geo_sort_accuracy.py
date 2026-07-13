"""Geographic sanity gates and rerank adjustments for sort accuracy."""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from analyze_policy import apply_analyze_gates  # noqa: E402
from classifier_scoring import rerank_candidate  # noqa: E402
from classify_audit import (  # noqa: E402
    geo_rerank_adjustment,
    geo_supports_new_folder,
    geographic_folder_conflict,
    infer_document_regions,
)
from constants import (  # noqa: E402
    CONFIDENCE_THRESHOLD,
    LLM_TRUST_FOR_WEAK_RERANK,
    UNCERTAIN_FOLDER,
)

_EVAL_FIXTURE = (
    Path(__file__).resolve().parents[1]
    / "classify_eval"
    / "fixtures"
    / "egypt_electricity_uae_regression.json"
)

_EGYPT_UTILITY_OCR = (
    "شركة القناة لتوزيع الكهرباء قطعة رقم 7 الغردقة "
    "خلف مديرية الصحة إجمالى قيمة المهمات EGP 73813"
)


class GeoAccuracyTests(unittest.TestCase):
    def test_infer_egypt_from_hurghada_utility_text(self) -> None:
        regions = infer_document_regions(_EGYPT_UTILITY_OCR)
        self.assertIn("egypt", regions)
        self.assertNotIn("uae", regions)

    def test_geographic_conflict_uae_folder_egypt_doc(self) -> None:
        reason = geographic_folder_conflict(
            _EGYPT_UTILITY_OCR,
            "United Arab Emirates/Construction Site",
        )
        self.assertIsNotNone(reason)
        self.assertIn("egypt", reason.lower())

    def test_geo_gate_blocks_uae_on_egyptian_utility_quote(self) -> None:
        scored = {
            "folder_name": "United Arab Emirates/Construction Site",
            "confidence": 0.85,
            "reason": "lease keywords",
            "candidate_scores": [
                {"folder_name": "United Arab Emirates/Construction Site", "score": 0.12},
                {"folder_name": "Uncertain", "score": 0.0},
            ],
            "llm_confidence": 0.85,
            "rerank_top_score": 0.12,
            "llm_folder_name": "United Arab Emirates/Construction Site",
            "classification_disagree": False,
        }
        gate = apply_analyze_gates(
            scored=scored,
            file_path="/tmp/2523c15a 2.JPG",
            quality_score=0.61,
            low_signal=False,
            existing_folders=["United Arab Emirates/Construction Site", "Uncertain"],
            existing_folders_lower={
                "united arab emirates/construction site",
                "uncertain",
            },
            threshold=CONFIDENCE_THRESHOLD,
            uncertain_folder=UNCERTAIN_FOLDER,
            extraction_source="image_ocr",
            extracted_text=_EGYPT_UTILITY_OCR,
        )
        self.assertEqual(gate.folder_name, UNCERTAIN_FOLDER)
        self.assertIn("geography", gate.reason.lower())

    def test_geo_rerank_penalizes_uae_on_egypt_doc(self) -> None:
        uae = rerank_candidate(
            "United Arab Emirates/Construction Site",
            _EGYPT_UTILITY_OCR,
            {"keywords": ["contrat", "bail"], "samples": ["Contrat de bail"]},
        )
        egypt = rerank_candidate(
            "Egypt/Utilities",
            _EGYPT_UTILITY_OCR,
            {},
        )
        self.assertGreater(egypt, uae)

    def test_geo_supports_new_egypt_folder(self) -> None:
        self.assertTrue(geo_supports_new_folder(_EGYPT_UTILITY_OCR, "Egypt/Utilities"))
        self.assertFalse(
            geo_supports_new_folder(_EGYPT_UTILITY_OCR, "United Arab Emirates/Construction Site")
        )

    def test_llm_rerank_gap_gate_when_llm_and_rerank_agree_weakly(self) -> None:
        scored = {
            "folder_name": "Finance",
            "confidence": 0.85,
            "reason": "ok",
            "candidate_scores": [
                {"folder_name": "Finance", "score": 0.1},
                {"folder_name": "HR", "score": 0.05},
            ],
            "llm_confidence": LLM_TRUST_FOR_WEAK_RERANK + 0.01,
            "rerank_top_score": 0.1,
            "llm_folder_name": "Finance",
            "classification_disagree": False,
        }
        gate = apply_analyze_gates(
            scored=scored,
            file_path="/tmp/x.pdf",
            quality_score=0.7,
            low_signal=False,
            existing_folders=["Finance", "HR"],
            existing_folders_lower={"finance", "hr"},
            threshold=CONFIDENCE_THRESHOLD,
            uncertain_folder=UNCERTAIN_FOLDER,
            extracted_text="generic invoice totals 100.00",
        )
        self.assertEqual(gate.folder_name, UNCERTAIN_FOLDER)
        self.assertIn("text match", gate.reason.lower())

    def test_geo_rerank_adjustment_signs(self) -> None:
        self.assertGreater(geo_rerank_adjustment(_EGYPT_UTILITY_OCR, "Egypt/Utilities"), 0.0)
        self.assertLess(
            geo_rerank_adjustment(_EGYPT_UTILITY_OCR, "United Arab Emirates/Construction Site"),
            0.0,
        )

    def test_eval_fixture_blocks_uae_misfile(self) -> None:
        """Regression: Hurghada electricity OCR must not auto-file to UAE (real sort-plan case)."""
        raw = json.loads(_EVAL_FIXTURE.read_text(encoding="utf-8"))
        text_path = Path(__file__).resolve().parents[1] / raw["text_file"]
        text = text_path.read_text(encoding="utf-8")
        scored = raw["scored"]
        gates_in = raw["gates"]
        existing = raw["existing_folders"]
        existing_lower = {x.strip().lower() for x in existing}
        gate = apply_analyze_gates(
            scored=scored,
            file_path=str(gates_in["file_path"]),
            quality_score=float(gates_in["quality_score"]),
            low_signal=bool(gates_in.get("low_signal", False)),
            existing_folders=existing,
            existing_folders_lower=existing_lower,
            threshold=CONFIDENCE_THRESHOLD,
            uncertain_folder=UNCERTAIN_FOLDER,
            extraction_source=str(gates_in.get("extraction_source", "")),
            extracted_text=text,
        )
        self.assertEqual(gate.folder_name, raw["gold_after_gates"])
        self.assertIn("egypt", infer_document_regions(text))


if __name__ == "__main__":
    unittest.main()
