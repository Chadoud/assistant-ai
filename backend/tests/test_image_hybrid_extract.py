"""Tests for hybrid OCR + vision image extraction."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from constants import EXTRACTION_UNCERTAIN_QUALITY
from ingest_image_merge import (
    VISUAL_SECTION_TAG,
    estimate_hybrid_image_quality,
    merge_image_extraction_signals,
    ocr_is_high_trust_for_filing,
)


class TestImageHybridMerge(unittest.TestCase):
    def test_merge_hybrid_includes_both_sections(self) -> None:
        merged, source, prov = merge_image_extraction_signals(
            "ocr line one",
            "Swiss passport belonging to Hilal Kassab",
        )
        self.assertEqual(source, "image_hybrid")
        self.assertTrue(prov["ocr"] and prov["vision"])
        self.assertIn(VISUAL_SECTION_TAG, merged)
        self.assertIn("ocr line one", merged)

    def test_merge_vision_only(self) -> None:
        merged, source, _ = merge_image_extraction_signals(None, "Receipt for 65 EGP")
        self.assertEqual(source, "image_vision")
        self.assertIn("Receipt", merged)

    def test_merge_empty_returns_low_signal_source(self) -> None:
        _, source, prov = merge_image_extraction_signals("", "")
        self.assertEqual(source, "image_low_signal")
        self.assertFalse(prov["ocr"] or prov["vision"])

    def test_hybrid_quality_meets_uncertain_floor(self) -> None:
        vision = "This is a passport scan issued by Switzerland for Hilal Kassab."
        merged, source, _ = merge_image_extraction_signals("junk ocr", vision)
        q = estimate_hybrid_image_quality(merged, source, ocr_text="junk ocr", vision_text=vision)
        self.assertGreaterEqual(q, float(EXTRACTION_UNCERTAIN_QUALITY))

    def test_ocr_high_trust_requires_length(self) -> None:
        self.assertFalse(ocr_is_high_trust_for_filing("short junk"))
        long_text = " ".join(["word"] * 50)
        self.assertTrue(ocr_is_high_trust_for_filing(long_text))


class TestExtractImageStructured(unittest.TestCase):
    @patch("builtins.open", new_callable=unittest.mock.mock_open, read_data=b"fakejpegbytes")
    @patch("PIL.Image.open")
    @patch("ingestor._vision.describe_image_bytes", return_value="Passport scan for Hilal Kassab")
    @patch("ingestor.tesseract_image_with_runtime", return_value="garbled ocr tokens here xx")
    @patch("ingestor.maybe_retry_arabic_ocr", side_effect=lambda _img, t, _ocr: t)
    def test_hybrid_runs_vision_even_when_ocr_actionable(
        self, _retry, _ocr, _vision, _img_open, _file_open
    ) -> None:
        from ingestor import _extract_image_structured

        _img_open.return_value = object()
        merged, source, prov, ocr_part, vision_part = _extract_image_structured(
            "/tmp/fake.jpg",
            vision_model="moondream:latest",
            ocr=object(),
        )
        self.assertEqual(source, "image_hybrid")
        self.assertTrue(prov["vision"])
        self.assertIn(VISUAL_SECTION_TAG, merged)
        self.assertTrue(vision_part)
        self.assertTrue(ocr_part)


if __name__ == "__main__":
    unittest.main()
