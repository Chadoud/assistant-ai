"""Arabic OCR retry and default lang priorities."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import ingest_tesseract as it  # noqa: E402


class ArabicOcrRetryTests(unittest.TestCase):
    def setUp(self) -> None:
        it._INSTALLED_LANGS_CACHE = ["ara", "eng", "fra"]

    def tearDown(self) -> None:
        it._INSTALLED_LANGS_CACHE = None

    @patch.object(it, "_tesseract_image_to_string")
    def test_retry_when_arabic_present_and_retry_richer(self, mock_ocr) -> None:
        initial = "eng junk الغردقة شركة القناة توزيع"
        richer = "شركة القناة لتوزيع الكهرباء قطعة رقم 7 الغردقة EGP 73813"
        mock_ocr.return_value = richer
        img = MagicMock()
        ocr = it.OcrRuntime(static_lang="eng", allowed=[], auto_per_page=False)
        out = it.maybe_retry_arabic_ocr(img, initial, ocr)
        self.assertIn("الغردقة", out)
        mock_ocr.assert_called_once()

    @patch.object(it, "_tesseract_image_to_string")
    def test_no_retry_without_arabic(self, mock_ocr) -> None:
        img = MagicMock()
        ocr = it.OcrRuntime(static_lang="eng", allowed=[], auto_per_page=False)
        out = it.maybe_retry_arabic_ocr(img, "invoice total 42.00", ocr)
        self.assertEqual(out, "invoice total 42.00")
        mock_ocr.assert_not_called()

    def test_default_analyze_ocr_langs_prioritizes_eng_ara(self) -> None:
        langs = it.default_analyze_ocr_langs()
        self.assertIsNotNone(langs)
        assert langs is not None
        self.assertEqual(langs[:2], ["eng", "ara"])


if __name__ == "__main__":
    unittest.main()
