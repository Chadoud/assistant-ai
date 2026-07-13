"""Entitlement gate + free trial integration (EXOSITES_USER_DATA)."""

import json
import pathlib
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from entitlement_constants import FREE_TRIAL_DAYS  # noqa: E402


def _write_trial(user_dir: pathlib.Path, *, active: bool) -> None:
    started = datetime.now(timezone.utc)
    ends = started + timedelta(days=FREE_TRIAL_DAYS if active else -1)
    payload = {
        "v": 1,
        "trialStartedAt": started.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
        "trialEndsAt": ends.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
        "source": "test",
    }
    (user_dir / "trial.json").write_text(json.dumps(payload), encoding="utf-8")


class TestEntitlementGate(unittest.TestCase):
    def test_may_start_analyze_without_user_data_env(self):
        import os

        from entitlement_gate import may_start_analyze

        old = os.environ.pop("EXOSITES_USER_DATA", None)
        try:
            ok, detail = may_start_analyze()
            self.assertTrue(ok)
            self.assertIsNone(detail)
        finally:
            if old is not None:
                os.environ["EXOSITES_USER_DATA"] = old

    def test_trial_expired_blocks_new_analyze(self):
        import os

        from fastapi import HTTPException

        from entitlement_gate import assert_may_start_analyze, may_start_analyze

        prev = os.environ.get("EXOSITES_USER_DATA")
        try:
            with tempfile.TemporaryDirectory() as tmp:
                os.environ["EXOSITES_USER_DATA"] = tmp
                _write_trial(pathlib.Path(tmp), active=False)
                ok, detail = may_start_analyze()
                self.assertFalse(ok)
                self.assertEqual(detail, "trial_expired")
                with self.assertRaises(HTTPException) as ctx:
                    assert_may_start_analyze()
                self.assertEqual(ctx.exception.status_code, 402)
        finally:
            if prev is None:
                os.environ.pop("EXOSITES_USER_DATA", None)
            else:
                os.environ["EXOSITES_USER_DATA"] = prev

    def test_active_trial_allows_analyze(self):
        import os

        from entitlement_gate import may_start_analyze

        prev = os.environ.get("EXOSITES_USER_DATA")
        prev_cloud = os.environ.get("EXOSITES_CLOUD_URL")
        try:
            with tempfile.TemporaryDirectory() as tmp:
                os.environ["EXOSITES_USER_DATA"] = tmp
                os.environ.pop("EXOSITES_CLOUD_URL", None)
                _write_trial(pathlib.Path(tmp), active=True)
                ok, detail = may_start_analyze()
                self.assertTrue(ok)
                self.assertIsNone(detail)
        finally:
            if prev is None:
                os.environ.pop("EXOSITES_USER_DATA", None)
            else:
                os.environ["EXOSITES_USER_DATA"] = prev
            if prev_cloud is None:
                os.environ.pop("EXOSITES_CLOUD_URL", None)
            else:
                os.environ["EXOSITES_CLOUD_URL"] = prev_cloud

    def test_cloud_configured_blocks_local_only_trial(self):
        import os

        from entitlement_gate import may_start_analyze

        prev_ud = os.environ.get("EXOSITES_USER_DATA")
        prev_cloud = os.environ.get("EXOSITES_CLOUD_URL")
        try:
            with tempfile.TemporaryDirectory() as tmp:
                os.environ["EXOSITES_USER_DATA"] = tmp
                os.environ["EXOSITES_CLOUD_URL"] = "https://api.exosites.ch"
                started = datetime.now(timezone.utc)
                ends = started + timedelta(days=FREE_TRIAL_DAYS)
                payload = {
                    "v": 1,
                    "trialStartedAt": started.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
                    "trialEndsAt": ends.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
                    "source": "local_first_launch",
                }
                (pathlib.Path(tmp) / "trial.json").write_text(json.dumps(payload), encoding="utf-8")
                ok, detail = may_start_analyze()
                self.assertFalse(ok)
                self.assertEqual(detail, "trial_expired")
        finally:
            if prev_ud is None:
                os.environ.pop("EXOSITES_USER_DATA", None)
            else:
                os.environ["EXOSITES_USER_DATA"] = prev_ud
            if prev_cloud is None:
                os.environ.pop("EXOSITES_CLOUD_URL", None)
            else:
                os.environ["EXOSITES_CLOUD_URL"] = prev_cloud

    def test_cloud_configured_allows_synced_trial(self):
        import os

        from entitlement_gate import may_start_analyze

        prev_ud = os.environ.get("EXOSITES_USER_DATA")
        prev_cloud = os.environ.get("EXOSITES_CLOUD_URL")
        try:
            with tempfile.TemporaryDirectory() as tmp:
                os.environ["EXOSITES_USER_DATA"] = tmp
                os.environ["EXOSITES_CLOUD_URL"] = "https://api.exosites.ch"
                started = datetime.now(timezone.utc)
                ends = started + timedelta(days=FREE_TRIAL_DAYS)
                payload = {
                    "v": 1,
                    "trialStartedAt": started.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
                    "trialEndsAt": ends.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
                    "source": "cloud_account",
                }
                (pathlib.Path(tmp) / "trial.json").write_text(json.dumps(payload), encoding="utf-8")
                ok, detail = may_start_analyze()
                self.assertTrue(ok)
                self.assertIsNone(detail)
        finally:
            if prev_ud is None:
                os.environ.pop("EXOSITES_USER_DATA", None)
            else:
                os.environ["EXOSITES_USER_DATA"] = prev_ud
            if prev_cloud is None:
                os.environ.pop("EXOSITES_CLOUD_URL", None)
            else:
                os.environ["EXOSITES_CLOUD_URL"] = prev_cloud

    def test_dev_bypass_allows_analyze_after_trial(self):
        import os

        from entitlement_gate import get_entitlement_status, may_start_analyze

        prev_ud = os.environ.get("EXOSITES_USER_DATA")
        prev_bypass = os.environ.get("EXOSITES_DEV_BYPASS_ENTITLEMENT")
        try:
            with tempfile.TemporaryDirectory() as tmp:
                os.environ["EXOSITES_USER_DATA"] = tmp
                os.environ["EXOSITES_DEV_BYPASS_ENTITLEMENT"] = "1"
                _write_trial(pathlib.Path(tmp), active=False)
                ok, detail = may_start_analyze()
                self.assertTrue(ok)
                self.assertIsNone(detail)
                status = get_entitlement_status()
                self.assertTrue(status["canAnalyze"])
        finally:
            if prev_ud is None:
                os.environ.pop("EXOSITES_USER_DATA", None)
            else:
                os.environ["EXOSITES_USER_DATA"] = prev_ud
            if prev_bypass is None:
                os.environ.pop("EXOSITES_DEV_BYPASS_ENTITLEMENT", None)
            else:
                os.environ["EXOSITES_DEV_BYPASS_ENTITLEMENT"] = prev_bypass

    def test_node_env_development_bypasses_trial(self):
        import os

        from entitlement_gate import may_start_analyze

        prev_ud = os.environ.get("EXOSITES_USER_DATA")
        prev_node_env = os.environ.get("NODE_ENV")
        prev_bypass = os.environ.get("EXOSITES_DEV_BYPASS_ENTITLEMENT")
        try:
            with tempfile.TemporaryDirectory() as tmp:
                os.environ["EXOSITES_USER_DATA"] = tmp
                os.environ["NODE_ENV"] = "development"
                os.environ.pop("EXOSITES_DEV_BYPASS_ENTITLEMENT", None)
                _write_trial(pathlib.Path(tmp), active=False)
                ok, detail = may_start_analyze()
                self.assertTrue(ok)
                self.assertIsNone(detail)
        finally:
            if prev_ud is None:
                os.environ.pop("EXOSITES_USER_DATA", None)
            else:
                os.environ["EXOSITES_USER_DATA"] = prev_ud
            if prev_node_env is None:
                os.environ.pop("NODE_ENV", None)
            else:
                os.environ["NODE_ENV"] = prev_node_env
            if prev_bypass is None:
                os.environ.pop("EXOSITES_DEV_BYPASS_ENTITLEMENT", None)
            else:
                os.environ["EXOSITES_DEV_BYPASS_ENTITLEMENT"] = prev_bypass


if __name__ == "__main__":
    unittest.main()
