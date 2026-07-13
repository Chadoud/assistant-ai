"""Unit tests for apply_analyze_gates (shared with JobService and file eval)."""

import pathlib
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from analyze_policy import apply_analyze_gates  # noqa: E402
from constants import (  # noqa: E402
    CONFIDENCE_THRESHOLD,
    EMPTY_FOLDER,
    EXTRACTION_UNCERTAIN_QUALITY,
    LLM_TRUST_FOR_WEAK_RERANK,
    UNCERTAIN_FOLDER,
)


def _scored_base(**over):
    d = {
        "folder_name": "Invoices",
        "confidence": 0.95,
        "reason": "invoice cues",
        "candidate_scores": [
            {"folder_name": "Invoices", "score": 0.9},
            {"folder_name": "HR", "score": 0.1},
        ],
        "llm_confidence": 0.95,
        "rerank_top_score": 0.9,
        "llm_folder_name": "Invoices",
        "classification_disagree": False,
    }
    d.update(over)
    return d


class TestApplyAnalyzeGates(unittest.TestCase):
    def test_low_quality_files_to_empty_without_strong_filename(self):
        g = apply_analyze_gates(
            scored=_scored_base(),
            file_path="C:/data/plain.pdf",
            quality_score=EXTRACTION_UNCERTAIN_QUALITY - 0.05,
            low_signal=False,
            existing_folders=["Invoices", "HR"],
            existing_folders_lower={"invoices", "hr"},
            threshold=CONFIDENCE_THRESHOLD,
            uncertain_folder=UNCERTAIN_FOLDER,
        )
        self.assertEqual(g.folder_name, EMPTY_FOLDER)
        self.assertIn("empty", g.reason.lower())

    def test_low_quality_filename_apg_escape_allows_weak_evidence(self):
        g = apply_analyze_gates(
            scored=_scored_base(
                folder_name="Bank Statements",
                llm_folder_name="Bank Statements",
            ),
            file_path="C:/data/apg_releve_sept.pdf",
            quality_score=EXTRACTION_UNCERTAIN_QUALITY - 0.05,
            low_signal=False,
            existing_folders=["Bank Statements"],
            existing_folders_lower={"bank statements"},
            threshold=CONFIDENCE_THRESHOLD,
            uncertain_folder=UNCERTAIN_FOLDER,
        )
        self.assertEqual(g.folder_name, "Bank Statements")
        self.assertTrue(g.allow_weak_evidence)

    def test_new_folder_blocked_when_quality_low_and_no_weak_escape(self):
        g = apply_analyze_gates(
            scored=_scored_base(
                folder_name="NovelTopic",
                llm_folder_name="NovelTopic",
                candidate_scores=[
                    {"folder_name": "NovelTopic", "score": 0.99},
                    {"folder_name": "HR", "score": 0.05},
                ],
                rerank_top_score=0.99,
            ),
            file_path="C:/data/x.pdf",
            quality_score=0.5,
            low_signal=False,
            existing_folders=["HR"],
            existing_folders_lower={"hr"},
            threshold=CONFIDENCE_THRESHOLD,
            uncertain_folder=UNCERTAIN_FOLDER,
        )
        self.assertEqual(g.folder_name, UNCERTAIN_FOLDER)
        self.assertIn("blocked", g.reason.lower())

    def test_ambiguous_tight_margin_keeps_llm_folder_when_confident(self):
        lc = LLM_TRUST_FOR_WEAK_RERANK + 0.05
        g = apply_analyze_gates(
            scored=_scored_base(
                folder_name="HR",
                llm_folder_name="Invoices",
                llm_confidence=lc,
                rerank_top_score=0.51,
                candidate_scores=[
                    {"folder_name": "HR", "score": 0.51},
                    {"folder_name": "Invoices", "score": 0.50},
                ],
            ),
            file_path="C:/data/x.pdf",
            quality_score=0.9,
            low_signal=False,
            existing_folders=["HR", "Invoices"],
            existing_folders_lower={"hr", "invoices"},
            threshold=CONFIDENCE_THRESHOLD,
            uncertain_folder=UNCERTAIN_FOLDER,
        )
        self.assertEqual(g.folder_name, "Invoices")
        self.assertGreaterEqual(g.confidence, lc - 0.001)
        self.assertIn("model pick", g.reason.lower())

    @patch("analyze_policy.AMBIGUOUS_FOLDER_FALLBACK_LLM", False)
    def test_ambiguous_tight_margin_respects_fallback_off(self):
        lc = LLM_TRUST_FOR_WEAK_RERANK + 0.05
        g = apply_analyze_gates(
            scored=_scored_base(
                folder_name="HR",
                llm_folder_name="Invoices",
                llm_confidence=lc,
                rerank_top_score=0.51,
                candidate_scores=[
                    {"folder_name": "HR", "score": 0.51},
                    {"folder_name": "Invoices", "score": 0.50},
                ],
            ),
            file_path="C:/data/x.pdf",
            quality_score=0.9,
            low_signal=False,
            existing_folders=["HR", "Invoices"],
            existing_folders_lower={"hr", "invoices"},
            threshold=CONFIDENCE_THRESHOLD,
            uncertain_folder=UNCERTAIN_FOLDER,
        )
        self.assertEqual(g.folder_name, UNCERTAIN_FOLDER)
        self.assertIn("ambiguous", g.reason.lower())

    def test_low_quality_calendar_ics_filename_escape(self):
        g = apply_analyze_gates(
            scored=_scored_base(
                folder_name="Calendar",
                llm_folder_name="Calendar",
            ),
            file_path="C:/data/meeting.ics",
            quality_score=EXTRACTION_UNCERTAIN_QUALITY - 0.05,
            low_signal=False,
            existing_folders=["Calendar", "HR"],
            existing_folders_lower={"calendar", "hr"},
            threshold=CONFIDENCE_THRESHOLD,
            uncertain_folder=UNCERTAIN_FOLDER,
        )
        self.assertEqual(g.folder_name, "Calendar")
        self.assertTrue(g.allow_weak_evidence)

    def test_low_quality_low_signal_video_does_not_trust_generic_media_bucket(self):
        lc = LLM_TRUST_FOR_WEAK_RERANK + 0.05
        g = apply_analyze_gates(
            scored=_scored_base(
                folder_name=UNCERTAIN_FOLDER,
                llm_folder_name="Media/Videos",
                llm_confidence=lc,
                candidate_scores=[
                    {"folder_name": "Media/Videos", "score": 0.0},
                    {"folder_name": UNCERTAIN_FOLDER, "score": 0.0},
                ],
                rerank_top_score=0.0,
            ),
            file_path="C:/staging/clip.mp4",
            quality_score=0.05,
            low_signal=True,
            existing_folders=["Media/Videos", "HR"],
            existing_folders_lower={"media/videos", "hr"},
            threshold=CONFIDENCE_THRESHOLD,
            uncertain_folder=UNCERTAIN_FOLDER,
        )
        self.assertEqual(g.folder_name, EMPTY_FOLDER)
        self.assertIn("usable", g.reason.lower())

    def test_low_quality_low_signal_video_trusts_llm_when_non_generic_folder_exists(self):
        lc = LLM_TRUST_FOR_WEAK_RERANK + 0.05
        g = apply_analyze_gates(
            scored=_scored_base(
                folder_name=UNCERTAIN_FOLDER,
                llm_folder_name="Finance/Bank Statements",
                llm_confidence=lc,
                candidate_scores=[
                    {"folder_name": "Finance/Bank Statements", "score": 0.0},
                    {"folder_name": UNCERTAIN_FOLDER, "score": 0.0},
                ],
                rerank_top_score=0.0,
            ),
            file_path="C:/staging/clip.mp4",
            quality_score=0.05,
            low_signal=True,
            existing_folders=["Finance/Bank Statements", "Media/Videos"],
            existing_folders_lower={"finance/bank statements", "media/videos"},
            threshold=CONFIDENCE_THRESHOLD,
            uncertain_folder=UNCERTAIN_FOLDER,
        )
        self.assertEqual(g.folder_name, "Finance/Bank Statements")
        self.assertGreaterEqual(g.confidence, lc - 0.001)
        self.assertTrue(g.allow_weak_evidence)

    def test_low_quality_video_not_low_signal_trusts_llm_when_non_generic_folder_exists(self):
        """Real video extract has text (low_signal False) but estimate_quality can stay < gate."""
        lc = LLM_TRUST_FOR_WEAK_RERANK + 0.05
        g = apply_analyze_gates(
            scored=_scored_base(
                folder_name=UNCERTAIN_FOLDER,
                llm_folder_name="Finance/Bank Statements",
                llm_confidence=lc,
                candidate_scores=[
                    {"folder_name": "Finance/Bank Statements", "score": 0.0},
                    {"folder_name": UNCERTAIN_FOLDER, "score": 0.0},
                ],
                rerank_top_score=0.0,
            ),
            file_path="C:/staging/clip.mp4",
            quality_score=EXTRACTION_UNCERTAIN_QUALITY - 0.08,
            low_signal=False,
            existing_folders=["Finance/Bank Statements", "Media/Videos"],
            existing_folders_lower={"finance/bank statements", "media/videos"},
            threshold=CONFIDENCE_THRESHOLD,
            uncertain_folder=UNCERTAIN_FOLDER,
            extraction_source="video_combined",
        )
        self.assertEqual(g.folder_name, "Finance/Bank Statements")
        self.assertTrue(g.allow_weak_evidence)

    def test_video_files_do_not_use_generic_videos_folder(self):
        g = apply_analyze_gates(
            scored=_scored_base(
                folder_name="Media/Videos",
                llm_folder_name="Media/Videos",
                confidence=0.95,
            ),
            file_path="C:/data/clinic clip.mp4",
            quality_score=0.5,
            low_signal=False,
            existing_folders=["Media/Videos", "HR"],
            existing_folders_lower={"media/videos", "hr"},
            threshold=CONFIDENCE_THRESHOLD,
            uncertain_folder=UNCERTAIN_FOLDER,
            extraction_source="video_combined",
        )
        self.assertEqual(g.folder_name, UNCERTAIN_FOLDER)
        self.assertIn("Generic Videos", g.reason)

    def test_new_folder_allowed_when_filename_cnc_and_llm_confident(self):
        lc = LLM_TRUST_FOR_WEAK_RERANK + 0.05
        g = apply_analyze_gates(
            scored=_scored_base(
                folder_name="Manufacturing/CNC Programs",
                llm_folder_name="Manufacturing/CNC Programs",
                candidate_scores=[
                    {"folder_name": "Manufacturing/CNC Programs", "score": 0.12},
                    {"folder_name": "HR", "score": 0.0},
                ],
                rerank_top_score=0.12,
                llm_confidence=lc,
            ),
            file_path="C:/data/part.nc",
            quality_score=0.5,
            low_signal=False,
            existing_folders=["HR"],
            existing_folders_lower={"hr"},
            threshold=CONFIDENCE_THRESHOLD,
            uncertain_folder=UNCERTAIN_FOLDER,
        )
        self.assertEqual(g.folder_name, "Manufacturing/CNC Programs")
        self.assertNotIn("blocked", g.reason.lower())

    def test_vision_backed_passport_not_blocked_as_new_folder(self):
        visual = "[Visual]\nSwiss passport for Hilal Kassab\n\n[OCR]\njunk"
        lc = LLM_TRUST_FOR_WEAK_RERANK + 0.05
        g = apply_analyze_gates(
            scored=_scored_base(
                folder_name="Switzerland",
                llm_folder_name="Switzerland",
                candidate_scores=[
                    {"folder_name": "Switzerland", "score": 0.15},
                    {"folder_name": UNCERTAIN_FOLDER, "score": 0.0},
                ],
                rerank_top_score=0.15,
                llm_confidence=lc,
                primary_purpose="passport scan",
            ),
            file_path="/tmp/uuid.jpg",
            quality_score=0.12,
            low_signal=False,
            existing_folders=["Egypt"],
            existing_folders_lower={"egypt"},
            threshold=CONFIDENCE_THRESHOLD,
            uncertain_folder=UNCERTAIN_FOLDER,
            extraction_source="image_hybrid",
            extracted_text=visual,
            doc_kind="passport_scan",
        )
        self.assertEqual(g.folder_name, "Switzerland")
        self.assertNotIn("blocked", g.reason.lower())


if __name__ == "__main__":
    unittest.main()
