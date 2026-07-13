"""Unit tests for JobService classification gate helpers."""

import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from analyze_policy import is_new_folder as _is_new_folder  # noqa: E402
from analyze_policy import top_two_close as _top_two_close
from constants import (  # noqa: E402
    CONFIDENCE_THRESHOLD,
    EXTRACTION_UNCERTAIN_QUALITY,
    NEW_FOLDER_MIN_QUALITY,
)


class TestTopTwoClose(unittest.TestCase):
    def test_margin_below_threshold_true(self):
        scores = [
            {"folder_name": "A", "score": 0.5},
            {"folder_name": "B", "score": 0.45},
        ]
        self.assertTrue(_top_two_close(scores, margin=0.12))

    def test_margin_above_threshold_false(self):
        scores = [
            {"folder_name": "A", "score": 0.9},
            {"folder_name": "B", "score": 0.2},
        ]
        self.assertFalse(_top_two_close(scores, margin=0.12))

    def test_single_candidate_false(self):
        self.assertFalse(_top_two_close([{"folder_name": "A", "score": 1.0}], margin=0.12))


class TestIsNewFolder(unittest.TestCase):
    def test_new(self):
        self.assertTrue(_is_new_folder("Brand New Folder", {"existing"}))

    def test_existing(self):
        self.assertFalse(_is_new_folder("Existing", {"existing"}))


class TestThresholdConstants(unittest.TestCase):
    """Document expected ranges for constants used in job_service."""

    def test_confidence_threshold_default(self):
        self.assertGreater(CONFIDENCE_THRESHOLD, 0)
        self.assertLess(CONFIDENCE_THRESHOLD, 1)

    def test_extraction_uncertain_quality(self):
        self.assertGreater(EXTRACTION_UNCERTAIN_QUALITY, 0)
        self.assertLess(EXTRACTION_UNCERTAIN_QUALITY, 1)

    def test_new_folder_min_quality(self):
        self.assertGreater(NEW_FOLDER_MIN_QUALITY, EXTRACTION_UNCERTAIN_QUALITY)


if __name__ == "__main__":
    unittest.main()
