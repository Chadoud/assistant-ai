"""Tests for ingestor text quality heuristics (no heavy PDF fixtures required)."""

import pathlib
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import ingestor
from constants import EXTRACTION_UNCERTAIN_QUALITY
from ingest_common import estimate_quality


class TestEstimateQualityHeuristic(unittest.TestCase):
    def test_cnc_numeric_dense_scores_above_uncertain_bar(self):
        body = "\n".join(
            f"N{i:04d} B{59 + i * 0.1:.3f} C{300 + i:.3f} X{100 + i:.3f} Y{20 - i * 0.1:.3f} Z{60 - i * 0.05:.3f}"
            for i in range(50)
        )
        q = estimate_quality(body)
        self.assertGreaterEqual(q, EXTRACTION_UNCERTAIN_QUALITY)

    def test_structured_video_summary_scores_respectably(self):
        v = (
            "Video: clip.mp4\n\nDuration: 120.0 s\n\n[Visual]\n"
            + " ".join(f"scene{n} desc" for n in range(80))
            + "\n\n[Spoken]\n"
            + " ".join(f"word{n:03d}" for n in range(200))
        )
        q = estimate_quality(v)
        self.assertGreaterEqual(q, EXTRACTION_UNCERTAIN_QUALITY)


class TestEstimateQualityViaPayload(unittest.TestCase):
    def test_plain_text_high_signal(self):
        # Quality blends length vs unique token count; repeated short prose can stay
        # below EXTRACTION_UNCERTAIN_QUALITY — use many distinct tokens + length.
        with tempfile.TemporaryDirectory() as tmp:
            p = pathlib.Path(tmp) / "note.txt"
            body = " ".join(f"term{n:03d}snippet" for n in range(120))
            p.write_text(body, encoding="utf-8")
            payload = ingestor.extract_content(str(p))
        self.assertGreaterEqual(payload["quality_score"], EXTRACTION_UNCERTAIN_QUALITY)
        self.assertEqual(payload["extraction_source"], "plain_text")

    def test_low_signal_fallback_quality(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = pathlib.Path(tmp) / "x.txt"
            p.write_text("LOW_SIGNAL_FALLBACK kind=test filename=foo", encoding="utf-8")
            payload = ingestor.extract_content(str(p))
        self.assertLess(payload["quality_score"], EXTRACTION_UNCERTAIN_QUALITY)

    def test_html_plain_branch(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = pathlib.Path(tmp) / "page.html"
            p.write_text("<html><body><p>Hello world content here</p></body></html>", encoding="utf-8")
            payload = ingestor.extract_content(str(p))
        self.assertIn("extraction_source", payload)
        self.assertTrue(payload.get("text"))

    def test_pts_branch_sets_cam_hint_and_source(self):
        body = "\n".join(
            f"{1.0 + i * 0.01} {-2.0 + i * 0.01} {3.0 + i * 0.01}" for i in range(60)
        )
        with tempfile.TemporaryDirectory() as tmp:
            p = pathlib.Path(tmp) / "part.pts"
            p.write_text(body, encoding="utf-8")
            payload = ingestor.extract_content(str(p))
        self.assertEqual(payload["extraction_source"], "cam_point_set_text")
        hint = (payload.get("signals") or {}).get("document_hint", "").lower()
        self.assertIn("point set", hint)
        self.assertIn("icalendar", hint)

    @patch("ingestor._ocr_pdf_pages", return_value="")
    @patch("ingestor._vision.describe_image_bytes")
    def test_pdf_vision_quality_is_estimated_and_capped(self, mock_vision, _ocr):
        import fitz

        mock_vision.return_value = "invoice total amount due vendor acme corp payment terms net thirty"
        with tempfile.TemporaryDirectory() as tmp:
            pdf = pathlib.Path(tmp) / "scan.pdf"
            doc = fitz.open()
            doc.new_page()
            doc.save(str(pdf))
            doc.close()
            payload = ingestor.extract_content(str(pdf), vision_model="llava:dummy")

        self.assertEqual(payload["extraction_source"], "pdf_vision")
        self.assertLessEqual(payload["quality_score"], 0.75)
        self.assertGreater(payload["quality_score"], 0.0)

    @patch("ingestor._ocr_pdf_pages", return_value="")
    @patch("ingestor._vision.describe_image_bytes")
    def test_pdf_sparse_native_text_uses_vision_fallback(self, mock_vision, _ocr):
        import fitz

        mock_vision.return_value = "kickoff event slide with dates and agenda bullets"
        with tempfile.TemporaryDirectory() as tmp:
            pdf = pathlib.Path(tmp) / "slides.pdf"
            doc = fitz.open()
            page = doc.new_page()
            page.insert_text((72, 72), "MoveX")
            doc.save(str(pdf))
            doc.close()
            payload = ingestor.extract_content(str(pdf), vision_model="llava:dummy")

        self.assertEqual(payload["extraction_source"], "pdf_vision")
        self.assertIn("kickoff", payload["text"].lower())

    @patch("ingestor._ocr_pdf_pages", return_value="")
    @patch("ingestor._vision.describe_image_bytes")
    def test_pdf_vision_short_blurb_scores_low(self, mock_vision, _ocr):
        import fitz

        mock_vision.return_value = "ok"
        with tempfile.TemporaryDirectory() as tmp:
            pdf = pathlib.Path(tmp) / "scan.pdf"
            doc = fitz.open()
            doc.new_page()
            doc.save(str(pdf))
            doc.close()
            payload = ingestor.extract_content(str(pdf), vision_model="llava:dummy")

        self.assertEqual(payload["extraction_source"], "pdf_vision")
        self.assertLess(payload["quality_score"], EXTRACTION_UNCERTAIN_QUALITY)


if __name__ == "__main__":
    unittest.main()
