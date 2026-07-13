"""Unit tests for telemetry payload validation."""

import unittest

from pydantic import ValidationError

from telemetry.schemas import FeedbackIn, TelemetryBatchIn, UiEventItem


class TestUiEventItem(unittest.TestCase):
    def test_rejects_forbidden_prop_key(self) -> None:
        with self.assertRaises(ValidationError):
            UiEventItem(name="tab_changed", props={"filepath": "x"})

    def test_accepts_allowlisted_props(self) -> None:
        item = UiEventItem(
            name="tab_changed",
            props={"tab": "queue", "from_tab": "settings"},
        )
        self.assertEqual(item.props["tab"], "queue")

    def test_granular_sort_events(self) -> None:
        UiEventItem(
            name="job_completed",
            props={
                "source": "local",
                "file_count_bucket": "6-20",
                "uncertain_rate_bucket": "1-10%",
                "outcome": "clean",
                "ocr_used": True,
            },
        )
        UiEventItem(name="sort_blocked", props={"reason": "no_output_folder"})
        UiEventItem(name="job_cancelled", props={"tab": "queue", "follow_up": "user"})

    def test_post_run_and_review_filter_events(self) -> None:
        UiEventItem(
            name="post_run_cta_clicked",
            props={"destination": "overview", "outcome": "clean", "ui_locale": "en"},
        )
        UiEventItem(
            name="review_filter_changed",
            props={"filter_field": "confidence", "selection": "high"},
        )


class TestTelemetryBatchIn(unittest.TestCase):
    def test_instance_id_chars(self) -> None:
        with self.assertRaises(ValidationError):
            TelemetryBatchIn(instance_id="bad id", events=[])

    def test_batch_roundtrip(self) -> None:
        b = TelemetryBatchIn(
            instance_id="abc-123-def",
            events=[UiEventItem(name="app_started", props={"ui_locale": "en"})],
        )
        self.assertEqual(len(b.events), 1)


class TestFeedbackIn(unittest.TestCase):
    def test_rejects_path_in_message(self) -> None:
        with self.assertRaises(ValidationError):
            FeedbackIn(instance_id="abc12345", message="See C:\\Users\\x\\file.pdf")


if __name__ == "__main__":
    unittest.main()
