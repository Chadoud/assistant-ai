"""Tests for candidate generation and reranking."""

import pathlib
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import classifier
from classifier import classify_candidates, rerank_candidate


class TestCandidateReranking(unittest.TestCase):
    def test_rerank_prefers_keyword_overlap(self):
        score_invoice = rerank_candidate(
            "Invoices",
            "invoice amount due vendor payment date",
            {"keywords": ["invoice", "vendor", "payment"], "samples": ["invoice total due"]},
            ["invoice", "acme"],
        )
        score_legal = rerank_candidate(
            "Legal",
            "invoice amount due vendor payment date",
            {"keywords": ["contract", "nda"], "samples": ["legal agreement"]},
            ["invoice", "acme"],
        )
        self.assertGreater(score_invoice, score_legal)

    @patch("classifier.classify_scored")
    def test_classify_candidates_returns_scores_and_reason(self, mock_scored):
        mock_scored.return_value = {"folder_name": "Work Certificates", "confidence": 0.8, "reason": "employment proof"}
        out = classify_candidates(
            text="certificat de travail attestation employeur",
            existing_folders=["Work Certificates", "Invoices"],
            folder_contexts={"Work Certificates": {"keywords": ["certificat", "travail"], "samples": ["certificat de travail"]}},
            model="mistral",
            language="French",
            filename_tokens=["certificat", "travail"],
        )
        self.assertIn("candidate_scores", out)
        self.assertTrue(out["candidate_scores"])
        self.assertIn("decision_reason", out)

    @patch("classifier.classify_scored")
    def test_llm_pick_boost_breaks_near_tie(self, mock_scored):
        """When rerank scores are clustered, boost the LLM's folder so margin can clear the gate."""
        from constants import CANDIDATE_MARGIN_THRESHOLD, UNCERTAIN_FOLDER

        mock_scored.return_value = {"folder_name": "Alpha", "confidence": 0.85, "reason": "pick"}

        def fake_rerank(candidate_folder: str, *_a, **_k) -> float:
            # Tight cluster: would trigger _top_two_close with old defaults without boost.
            scores = {"Alpha": 0.41, "Beta": 0.40, UNCERTAIN_FOLDER: 0.05}
            return float(scores.get(candidate_folder, 0.1))

        with patch.object(classifier, "rerank_candidate", side_effect=fake_rerank):
            out = classify_candidates(
                "some document text about payroll and benefits",
                ["Alpha", "Beta"],
                {},
                model="mistral",
                language="English",
            )
        ranked = sorted(out["candidate_scores"], key=lambda x: float(x["score"]), reverse=True)
        margin = float(ranked[0]["score"]) - float(ranked[1]["score"])
        self.assertGreaterEqual(margin, CANDIDATE_MARGIN_THRESHOLD)
        self.assertEqual(out["folder_name"], "Alpha")

    @patch("classifier.classify_scored")
    def test_llm_agreement_boost_reduced_when_extraction_weak(self, mock_scored):
        """No agreement boost when extraction_quality is below the ramp—do not inflate weak OCR decisions."""
        from constants import CANDIDATE_MARGIN_THRESHOLD, UNCERTAIN_FOLDER

        mock_scored.return_value = {"folder_name": "Alpha", "confidence": 0.85, "reason": "pick"}

        def fake_rerank(candidate_folder: str, *_a, **_k) -> float:
            scores = {"Alpha": 0.41, "Beta": 0.40, UNCERTAIN_FOLDER: 0.05}
            return float(scores.get(candidate_folder, 0.1))

        with patch.object(classifier, "rerank_candidate", side_effect=fake_rerank):
            out = classify_candidates(
                "thin ocr",
                ["Alpha", "Beta"],
                {},
                model="mistral",
                language="English",
                extraction_quality=0.08,
            )
        ranked = sorted(out["candidate_scores"], key=lambda x: float(x["score"]), reverse=True)
        margin = float(ranked[0]["score"]) - float(ranked[1]["score"])
        self.assertLess(margin, CANDIDATE_MARGIN_THRESHOLD)
        self.assertEqual(out["folder_name"], "Alpha")

    @patch("classifier.classify_scored")
    def test_scored_shortlist_always_includes_uncertain_when_capped(self, mock_scored):
        from constants import UNCERTAIN_FOLDER

        mock_scored.return_value = {"folder_name": "ZPick", "confidence": 0.9, "reason": "ok"}
        folders = [f"Row{i}" for i in range(40)]
        out = classify_candidates(
            "invoice payment receipt quarterly report filed taxes",
            folders,
            {},
            model="mistral",
            language="English",
            max_candidates=8,
        )
        names = [c["folder_name"] for c in out["candidate_scores"]]
        self.assertIn(UNCERTAIN_FOLDER, names)
        self.assertLessEqual(len(out["candidate_scores"]), 8)

    @patch("classifier.classify_scored")
    def test_classify_candidates_exposes_llm_and_disagree_meta(self, mock_scored):
        mock_scored.return_value = {"folder_name": "LLMFolder", "confidence": 0.9, "reason": "ok"}

        def fake_rerank(candidate_folder: str, *_a, **_k) -> float:
            return 0.99 if candidate_folder == "RerankWins" else 0.1

        with patch.object(classifier, "rerank_candidate", side_effect=fake_rerank):
            out = classify_candidates(
                "some text",
                ["RerankWins", "Other"],
                {},
                model="m",
                language="English",
            )
        self.assertEqual(out["folder_name"], "RerankWins")
        self.assertAlmostEqual(out["llm_confidence"], 0.9, places=2)
        self.assertTrue(out["classification_disagree"])

    @patch("classifier.classify_scored")
    def test_weak_rerank_trusts_llm_when_lexical_scores_low(self, mock_scored):
        """Rerank winner is wrong with low absolute scores → use LLM if it picks an existing folder."""
        mock_scored.return_value = {"folder_name": "Finance", "confidence": 0.92, "reason": "bank statement"}

        def fake_rerank(candidate_folder: str, *_a, **_k) -> float:
            # Top lexical is Employment, but score stays below RERANK_WEAK_FLOOR; LLM boost must not flip the winner.
            return {"EmploymentRecords": 0.26, "Finance": 0.1}.get(candidate_folder, 0.05)

        with patch.object(classifier, "rerank_candidate", side_effect=fake_rerank):
            out = classify_candidates(
                "relevé bancaire UBS transactions IBAN",
                ["EmploymentRecords", "Finance"],
                {},
                model="m",
                language="English",
            )
        self.assertEqual(out["folder_name"], "Finance")
        self.assertFalse(out["classification_disagree"])
        self.assertEqual(out["llm_folder_name"], "Finance")

    @patch("classifier.classify_scored")
    def test_weak_rerank_trusts_new_folder_invented_by_llm(self, mock_scored):
        """User need not create destination folders first when lexical scores are weak."""
        mock_scored.return_value = {"folder_name": "Bank Statements", "confidence": 0.91, "reason": "releve"}

        def fake_rerank(candidate_folder: str, *_a, **_k) -> float:
            return {"EmploymentRecords": 0.26, "Bank Statements": 0.08}.get(candidate_folder, 0.04)

        with patch.object(classifier, "rerank_candidate", side_effect=fake_rerank):
            out = classify_candidates(
                "thin ocr text",
                ["EmploymentRecords"],
                {},
                model="m",
                language="English",
            )
        self.assertEqual(out["folder_name"], "Bank Statements")
        self.assertFalse(out["classification_disagree"])

    def test_rerank_filename_emphasis_boosts_filename_only_overlap(self):
        """When emphasis is on, folder path overlap driven by filename tokens counts more than merged-only."""
        long_body = "governance corporate policy " * 40
        fn = ["appointment", "invite", "calendar"]
        ctx = {"keywords": [], "samples": []}
        plain = rerank_candidate("Events/Appointment Reminders", long_body, ctx, fn, filename_emphasis=0.0)
        boosted = rerank_candidate("Events/Appointment Reminders", long_body, ctx, fn, filename_emphasis=0.55)
        self.assertGreater(boosted, plain)

    def test_rerank_boosts_finance_on_bank_keywords(self):
        s = rerank_candidate(
            "BankStatements",
            "Monthly releve bancaire and IBAN ending 1234",
            {},
            [],
        )
        s_plain = rerank_candidate(
            "EmploymentRecords",
            "Monthly releve bancaire and IBAN ending 1234",
            {},
            [],
        )
        self.assertGreater(s, s_plain)

    def test_intent_boost_career_applied_to_career_folder(self):
        """A CV document should boost Career folder via intent_boost."""
        from classifier_scoring import intent_boost
        tokens = {"resume", "curriculum", "vitae", "experience", "education"}
        boost = intent_boost("Career/CV", tokens)
        self.assertGreater(boost, 0.0)

    def test_intent_boost_finance_cancelled_when_career_signals_present(self):
        """A CV with a Finance degree in the text must NOT boost Finance folders."""
        from classifier_scoring import intent_boost
        # CV text that mentions finance/investment (e.g. "Finance & Accounting" degree)
        tokens = {"resume", "curriculum", "vitae", "experience", "finance", "investment"}
        boost = intent_boost("Finance/FinancialNewsletters", tokens)
        self.assertEqual(boost, 0.0, "Finance boost should be cancelled when career tokens also present")

    def test_intent_boost_finance_unaffected_without_career_signals(self):
        """A genuine financial document with no career tokens keeps the finance boost."""
        from classifier_scoring import intent_boost
        tokens = {"invoice", "virement", "investment", "portfolio", "compte"}
        boost = intent_boost("Finance", tokens)
        self.assertGreater(boost, 0.0)

    @patch("classifier.classify_scored")
    @patch("classifier._narrow_disambiguate")
    def test_disagree_cross_domain_triggers_narrow_tie(self, mock_narrow, mock_scored):
        """When LLM picks Career/CV but reranker picks Finance (different top segment),
        the narrow-tie LLM call fires even if the rerank margin is above the normal threshold."""
        from constants import LLM_TRUST_FOR_WEAK_RERANK

        # LLM confidently says Career/CV
        mock_scored.return_value = {
            "folder_name": "Career/CV",
            "confidence": LLM_TRUST_FOR_WEAK_RERANK + 0.02,
            "reason": "CV document",
            "primary_purpose": "professional resume",
        }

        # Narrow-tie returns the LLM's pick
        mock_narrow.return_value = {
            "folder_name": "Career/CV",
            "confidence": 0.91,
            "reason": "CV not Finance",
        }

        def fake_rerank(candidate_folder: str, *_a, **_k) -> float:
            # Reranker strongly prefers Finance (e.g. CV mentions Finance degree)
            return {"Finance": 0.60, "Career/CV": 0.12}.get(candidate_folder, 0.05)

        with patch.object(classifier, "rerank_candidate", side_effect=fake_rerank):
            out = classify_candidates(
                "curriculum vitae finance accounting bachelor experience skills",
                ["Finance", "Career/CV"],
                {},
                model="m",
                language="English",
                extraction_quality=0.9,
                source_filename="C.V. Chady KASSAB.pdf",
            )

        # narrow disambiguate must have been called (disagree_cross_domain fired)
        self.assertTrue(mock_narrow.called, "Narrow-tie should fire on cross-domain disagreement")
        self.assertEqual(out["folder_name"], "Career/CV")


if __name__ == "__main__":
    unittest.main()
