"""Classifier tests with mocked ollama.chat (no live model)."""

import os
import pathlib
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import classifier
from constants import UNCERTAIN_FOLDER


class TestClassifierOllamaMock(unittest.TestCase):
    def test_classify_scored_parses_json(self):
        fake = '{"folder_name": "Invoices", "confidence": 0.9, "reason": "Mentions invoice"}'

        with patch.object(classifier.ollama, "chat", return_value={"message": {"content": fake}}) as m_chat:
            out = classifier.classify_scored(
                "Invoice number 99 total 100 EUR",
                ["Invoices", "HR"],
                {},
                model="mistral",
                language="English",
                source_filename="invoice_acme_2024.pdf",
            )

        user = m_chat.call_args.kwargs["messages"][1]["content"]
        self.assertIn("invoice_acme_2024.pdf", user)
        self.assertEqual(out["folder_name"], "Invoices")
        self.assertAlmostEqual(out["confidence"], 0.9, places=3)
        self.assertIn("invoice", out["reason"].lower())

    def test_classify_scored_folder_names_follow_job_language_not_detection(self):
        """French detection hint must not change the folder-name language line."""
        fake = '{"folder_name": "Invoices", "confidence": 0.9, "reason": "ok"}'
        with patch.object(classifier.ollama, "chat", return_value={"message": {"content": fake}}) as m_chat:
            classifier.classify_scored(
                "facture numéro 12",
                ["Invoices"],
                {},
                model="mistral",
                language="English",
                classification_language="French",
            )
        user = m_chat.call_args.kwargs["messages"][1]["content"]
        self.assertIn("Folder names must be in English.", user)

    def test_parse_mixed_markdown_json(self):
        raw = 'Here is the result:\n```json\n{"folder_name":"Contracts","confidence":0.77,"reason":"NDA terms"}\n```'

        with patch.object(classifier.ollama, "chat", return_value={"message": {"content": raw}}):
            out = classifier.classify_scored("Confidential NDA agreement", ["Contracts"], {}, model="m", language="English")

        self.assertEqual(out["folder_name"], "Contracts")
        self.assertGreaterEqual(out["confidence"], 0.7)

    def test_rerank_candidate_uncertain_capped(self):
        s = classifier.rerank_candidate(UNCERTAIN_FOLDER, "hello world", {}, [])
        self.assertLessEqual(s, 0.2)

    def test_narrow_disambiguate_picks_one_of_two(self):
        raw = '{"folder_name": "Alpha", "confidence": 0.88, "reason": "matches Alpha"}'
        with patch.object(classifier.ollama, "chat", return_value={"message": {"content": raw}}):
            nu = classifier._narrow_disambiguate(
                "invoice total 100 EUR",
                "Alpha",
                "Beta",
                "mistral",
                "English",
            )
        self.assertIsNotNone(nu)
        self.assertEqual(nu["folder_name"], "Alpha")

    def test_classify_candidates_narrow_tie_break_env(self):
        """OLLAMA_NARROW_TIE_BREAK triggers a second chat when top-2 margin is tight."""

        def fake_rerank(candidate_folder: str, *_args, **_kwargs) -> float:
            scores = {"A": 0.41, "B": 0.40, UNCERTAIN_FOLDER: 0.05}
            return float(scores.get(candidate_folder, 0.1))

        narrow_json = '{"folder_name": "B", "confidence": 0.92, "reason": "narrow chose B"}'
        with patch.dict(
            os.environ,
            {"OLLAMA_NARROW_TIE_BREAK": "1", "OLLAMA_NARROW_MARGIN": "0.5"},
            clear=False,
        ):
            with patch.object(
                classifier,
                "classify_scored",
                return_value={"folder_name": "A", "confidence": 0.5, "reason": "first pass"},
            ):
                with patch.object(classifier, "rerank_candidate", side_effect=fake_rerank):
                    with patch.object(
                        classifier.ollama,
                        "chat",
                        return_value={"message": {"content": narrow_json}},
                    ):
                        out = classifier.classify_candidates(
                            "some file text about documents",
                            ["A", "B"],
                            {},
                            model="mistral",
                            language="English",
                        )
        self.assertEqual(out["folder_name"], "B")
        self.assertGreaterEqual(out["confidence"], 0.9)
        self.assertIn("narrow_tie_break", out.get("decision_reason", ""))

    def test_narrow_skipped_when_rerank_and_extraction_weak(self):
        """Do not spend a narrow LLM call when lexical top score and OCR quality are both garbage."""

        def fake_rerank(candidate_folder: str, *_args, **_kwargs) -> float:
            scores = {"A": 0.15, "B": 0.14, UNCERTAIN_FOLDER: 0.05}
            return float(scores.get(candidate_folder, 0.1))

        with patch.object(
            classifier,
            "classify_scored",
            return_value={"folder_name": "A", "confidence": 0.5, "reason": "first pass"},
        ):
            with patch.object(classifier, "rerank_candidate", side_effect=fake_rerank):
                with patch.object(classifier.ollama, "chat") as m_chat:
                    out = classifier.classify_candidates(
                        "garbled scan",
                        ["A", "B"],
                        {},
                        model="mistral",
                        language="English",
                        extraction_quality=0.1,
                    )
        self.assertFalse(m_chat.called)
        self.assertEqual(out["folder_name"], "A")
        trace = out.get("decision_trace") or {}
        self.assertTrue(trace.get("narrow_skipped_weak_signal"))

    def test_classify_candidates_passes_detected_language_to_trace_only(self):
        """Optional ``classification_language`` must not be forwarded into classify_scored."""
        mock_scored = MagicMock(
            return_value={"folder_name": "Invoices", "confidence": 0.8, "reason": "ok"}
        )

        def fake_rerank(candidate_folder: str, *_a, **_k) -> float:
            return 0.9 if candidate_folder == "Invoices" else 0.2

        with patch.object(classifier, "classify_scored", mock_scored):
            with patch.object(classifier, "rerank_candidate", side_effect=fake_rerank):
                out = classifier.classify_candidates(
                    "texte français",
                    ["Invoices", "HR"],
                    {},
                    model="mistral",
                    language="English",
                    classification_language="French",
                )
        self.assertEqual(mock_scored.call_args.kwargs.get("classification_language"), None)
        self.assertEqual((out.get("decision_trace") or {}).get("detected_language"), "French")
        self.assertEqual((out.get("decision_trace") or {}).get("folder_names_language"), "English")


if __name__ == "__main__":
    unittest.main()
