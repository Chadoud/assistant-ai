"""Structure template classify path must not be overridden by flat-folder rerank."""

from __future__ import annotations

import pathlib
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from classifier import classify_candidates  # noqa: E402
from constants import UNCERTAIN_FOLDER  # noqa: E402
from sort_structure.compile import ClassifyContract, ThemeLevel  # noqa: E402


def _country_auto_contract() -> ClassifyContract:
    return ClassifyContract(
        levels=(
            ThemeLevel(
                key="country",
                theme="country",
                prompt_instruction="Country",
                max_folders=20,
                overflow_policy="uncertain",
                ui_label="country",
                custom_label=None,
            ),
            ThemeLevel(
                key="auto",
                theme="auto",
                prompt_instruction="AI decides",
                max_folders=None,
                overflow_policy="uncertain",
                ui_label="auto",
                custom_label=None,
            ),
        ),
        has_auto_tail=True,
    )


class TestClassifyCandidatesStructure(unittest.TestCase):
    @patch("classifier.classify_scored")
    def test_structure_skips_rerank_and_preserves_fields(self, mock_scored):
        mock_scored.return_value = {
            "folder_name": "Egypt/Bankstatements",
            "confidence": 0.88,
            "reason": "Egyptian bank statement",
            "structure_values": {"country": "Egypt"},
            "structure_path_provisional": "Egypt/Bankstatements",
            "decision_trace": {
                "structure_template": True,
                "structure_parse_failed": False,
                "structure_auto_tail": "Bankstatements",
            },
        }
        contract = _country_auto_contract()
        out = classify_candidates(
            text="bank statement cairo",
            existing_folders=["Finance", "Egypt", "Uncertain"],
            folder_contexts={"Finance": {"keywords": ["bank"], "samples": []}},
            model="mistral",
            language="English",
            structure_contract=contract,
        )
        self.assertEqual(out["folder_name"], "Egypt/Bankstatements")
        self.assertEqual(out["llm_folder_name"], "Egypt/Bankstatements")
        self.assertFalse(out["classification_disagree"])
        self.assertEqual(out["structure_values"], {"country": "Egypt"})
        self.assertEqual(out["structure_path_provisional"], "Egypt/Bankstatements")
        trace = out["decision_trace"]
        self.assertTrue(trace.get("structure_template"))
        self.assertTrue(trace.get("structure_rerank_skipped"))
        self.assertEqual(trace.get("structure_auto_tail"), "Bankstatements")
        self.assertNotIn("Finance", [c["folder_name"] for c in out["candidate_scores"]])

    @patch("classifier.classify_scored")
    def test_flat_mode_still_reranks_against_existing(self, mock_scored):
        mock_scored.return_value = {
            "folder_name": "Egypt",
            "confidence": 0.7,
            "reason": "Egypt doc",
        }
        with patch("classifier.rank_existing_folders", return_value=[("Finance", 0.9)]):
            out = classify_candidates(
                text="invoice",
                existing_folders=["Finance", "Egypt"],
                folder_contexts={},
                model="mistral",
                language="English",
                structure_contract=None,
            )
        names = [c["folder_name"] for c in out["candidate_scores"]]
        self.assertIn("Finance", names)
        self.assertNotIn("structure_rerank_skipped", out.get("decision_trace", {}))

    @patch("classifier.classify_scored")
    def test_structure_parse_failure_stays_uncertain(self, mock_scored):
        mock_scored.return_value = {
            "folder_name": UNCERTAIN_FOLDER,
            "confidence": 0.3,
            "reason": "Structure extraction failed",
            "decision_trace": {
                "structure_template": True,
                "structure_parse_failed": True,
                "structure_auto_tail": None,
            },
        }
        out = classify_candidates(
            text="???",
            existing_folders=["Finance"],
            folder_contexts={},
            model="mistral",
            language="English",
            structure_contract=_country_auto_contract(),
        )
        self.assertEqual(out["folder_name"], UNCERTAIN_FOLDER)
        self.assertTrue(out["decision_trace"].get("structure_parse_failed"))
