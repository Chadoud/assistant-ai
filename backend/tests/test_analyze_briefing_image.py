"""Briefing defaults for image OCR sources."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from job_service.analyze_support import effective_document_briefing_enabled  # noqa: E402


class BriefingForImageTests(unittest.TestCase):
    def test_image_ocr_on_even_when_global_off(self) -> None:
        cfg: dict = {"document_briefing_enable": None}
        with patch("job_service.analyze_support.DOCUMENT_BRIEFING_ENABLE", False):
            self.assertTrue(
                effective_document_briefing_enabled(cfg, extraction_source="image_ocr")
            )

    def test_image_ocr_respects_explicit_job_disable(self) -> None:
        cfg = {"document_briefing_enable": False}
        self.assertFalse(
            effective_document_briefing_enabled(cfg, extraction_source="image_ocr")
        )

    def test_plain_text_follows_global(self) -> None:
        cfg: dict = {"document_briefing_enable": None}
        with patch("job_service.analyze_support.DOCUMENT_BRIEFING_ENABLE", False):
            self.assertFalse(
                effective_document_briefing_enabled(cfg, extraction_source="plain_text")
            )


if __name__ == "__main__":
    unittest.main()
