"""Tests for lightweight document language detection."""

import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from language_detect import detect_document_language, tesseract_langs_for_hint  # noqa: E402


class TestLanguageDetect(unittest.TestCase):
    def test_short_text_returns_fallback(self):
        self.assertEqual(detect_document_language("hi", fallback="German"), "German")

    def test_french_admin_snippet(self):
        text = (
            "République et canton de Genève. Attestation de l'employeur pour "
            "l'assurance-chômage. Monsieur Dupont demande une indemnité."
        ) * 5
        self.assertEqual(detect_document_language(text, fallback="English"), "French")

    def test_detect_arabic_script(self):
        text = "شركة القناة لتوزيع الكهرباء قطعة رقم 7 الغردقة EGP"
        self.assertEqual(detect_document_language(text, fallback="English"), "Arabic")

    def test_tesseract_langs_merge_arabic(self):
        merged = tesseract_langs_for_hint("Arabic", ["eng"])
        self.assertIsNotNone(merged)
        assert merged is not None
        self.assertEqual(merged[0], "ara")

    def test_tesseract_langs_merge(self):
        self.assertEqual(
            tesseract_langs_for_hint("French", ["eng"]),
            ["fra", "eng"],
        )


if __name__ == "__main__":
    unittest.main()
