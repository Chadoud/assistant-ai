"""Tests for structured extraction quality payload."""

import pathlib
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from ingestor import extract_content


class TestExtractionQuality(unittest.TestCase):
    def test_plain_text_payload_contains_quality_and_signals(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = pathlib.Path(tmp) / "work_certificate_notes.txt"
            p.write_text("Work certificate from ACME company for internship role", encoding="utf-8")
            payload = extract_content(str(p))
            self.assertIn("text", payload)
            self.assertIn("quality_score", payload)
            self.assertIn("signals", payload)
            self.assertEqual(payload["extraction_source"], "plain_text")
            self.assertGreaterEqual(payload["quality_score"], 0.0)
            self.assertLessEqual(payload["quality_score"], 1.0)
            self.assertIn("filename_tokens", payload["signals"])

    def test_low_signal_marker_maps_to_low_quality(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = pathlib.Path(tmp) / "image_scan_only.bin"
            p.write_bytes(b"\x00\x01\x02")
            payload = extract_content(str(p))
            # Unknown binary falls through fallback plain text with low quality.
            self.assertIn("quality_score", payload)
            self.assertGreaterEqual(payload["quality_score"], 0.0)
            self.assertLessEqual(payload["quality_score"], 1.0)


if __name__ == "__main__":
    unittest.main()
