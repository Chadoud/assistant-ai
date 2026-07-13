"""Lightweight HTTP smoke tests for always-on API routes."""

import pathlib
import sys
import unittest

from fastapi.testclient import TestClient

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from main import app, create_app


class TestApiRoutesSmoke(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_health(self) -> None:
        r = self.client.get("/health")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json().get("status"), "ok")

    def test_meta_audio(self) -> None:
        r = self.client.get("/meta/audio")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIs(data.get("captures_microphone"), False)
        self.assertIs(data.get("captures_speaker"), False)

    def test_meta_video_shape(self) -> None:
        r = self.client.get("/meta/video")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        for key in (
            "ffmpeg_path",
            "ffprobe_path",
            "can_decode_video",
            "vendored_bundle_detected",
            "frame_count",
            "max_duration_sec",
            "max_extract_sec",
            "max_transcript_chars",
            "ffmpeg_timeout_sec",
            "ffprobe_timeout_sec",
            "stt_enabled",
            "stt_model",
            "debug_log",
        ):
            self.assertIn(key, data)
        self.assertIsInstance(data["can_decode_video"], bool)
        self.assertIsInstance(data["vendored_bundle_detected"], bool)

    def test_meta_sort_prompt_default(self) -> None:
        r = self.client.get("/meta/sort-prompt-default")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("default", data)
        self.assertIsInstance(data["default"], str)
        self.assertGreater(len(data["default"]), 80)

    def test_public_client_config_shape(self) -> None:
        r = self.client.get("/v1/public/client-config")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        for key in (
            "min_supported_client",
            "policy_version",
            "free_trial_days",
            "telemetry_ingest_enabled",
            "feedback_ingest_enabled",
        ):
            self.assertIn(key, data)

    def test_entitlement_status_shape(self) -> None:
        r = self.client.get("/entitlement/status")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        for key in (
            "trialActive",
            "trialStartedAt",
            "trialEndsAt",
            "trialDaysRemaining",
            "trialExpired",
            "licensed",
            "licenseReason",
            "canAnalyze",
            "hasLicenseKey",
            "cloudAuthRequired",
            "cloudLoggedIn",
            "sortServiceMode",
            "sortServiceConfigured",
            "sortCredentialsManaged",
        ):
            self.assertIn(key, data)

    def test_create_app_isolated_instance(self) -> None:
        isolated = create_app()
        self.assertIsNotNone(isolated.state.job_service)
        c = TestClient(isolated)
        self.assertEqual(c.get("/health").status_code, 200)


if __name__ == "__main__":
    unittest.main()
