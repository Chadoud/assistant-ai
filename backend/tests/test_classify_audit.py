"""Tests for classify_audit debug snapshot."""

from __future__ import annotations

import unittest

from classify_audit import build_classify_audit, winner_folder_context_snapshot


class ClassifyAuditTests(unittest.TestCase):
    def test_geo_hits_on_egyptian_electricity_ocr(self) -> None:
        text = (
            "شركة القناة لتوزيع الكهرباء قطعة رقم 7 الغردقة "
            "خلف مديرية الصحة إجمالى قيمة المهمات EGP"
        )
        audit = build_classify_audit(
            text=text,
            folder_name="United Arab Emirates/Construction Site",
            llm_folder_name="United Arab Emirates/Construction Site",
            llm_confidence=0.85,
            rerank_top_score=0.12,
            folder_contexts={
                "United Arab Emirates/Construction Site": {
                    "keywords": ["contrat", "bail", "bailleresse"],
                    "samples": ["Contrat de bail général pour logements"],
                }
            },
            detected_language="English",
            briefing_wanted=True,
            briefing_skipped_plain=False,
            primary_purpose="LeaseAgreements",
        )
        self.assertIn("hurghada", audit["geo_hits"])
        self.assertIn("canal_electricity", audit["geo_hits"])
        self.assertAlmostEqual(audit["llm_rerank_gap"], 0.73, places=2)
        ctx = audit["winner_context"]
        self.assertEqual(ctx["folder"], "United Arab Emirates/Construction Site")
        self.assertIn("contrat", ctx["keywords"])

    def test_winner_folder_context_snapshot(self) -> None:
        snap = winner_folder_context_snapshot(
            "Finance/Bank",
            {"Finance/Bank": {"keywords": ["iban", "ubs"], "samples": ["Account statement"], "profile": ""}},
        )
        self.assertEqual(snap["keywords"], ["iban", "ubs"])
        self.assertEqual(len(snap["sample_snippets"]), 1)


if __name__ == "__main__":
    unittest.main()
