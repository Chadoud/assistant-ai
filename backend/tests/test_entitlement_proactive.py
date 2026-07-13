"""Proactive entitlement gate: free trial, license, and dev bypass."""

from __future__ import annotations

import importlib
import json
import os
from datetime import datetime, timedelta, timezone

import pytest

from entitlement_constants import FREE_TRIAL_DAYS


@pytest.fixture()
def gate(tmp_path, monkeypatch):
    monkeypatch.delenv("EXOSITES_DEV_BYPASS_ENTITLEMENT", raising=False)
    monkeypatch.setenv("NODE_ENV", "production")
    monkeypatch.setenv("EXOSITES_USER_DATA", str(tmp_path))
    import entitlement_gate

    importlib.reload(entitlement_gate)
    return entitlement_gate, tmp_path


def _write_trial(user_data: str, *, active: bool) -> None:
    started = datetime.now(timezone.utc)
    ends = started + timedelta(days=FREE_TRIAL_DAYS if active else -1)
    with open(os.path.join(user_data, "trial.json"), "w", encoding="utf-8") as f:
        json.dump(
            {
                "v": 1,
                "trialStartedAt": started.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
                "trialEndsAt": ends.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
                "source": "test",
            },
            f,
        )


def test_allowed_within_trial(gate):
    entitlement_gate, user_data = gate
    _write_trial(user_data, active=True)
    allowed, reason = entitlement_gate.may_use_proactive()
    assert allowed is True
    assert reason is None


def test_blocked_past_trial_without_license(gate):
    entitlement_gate, user_data = gate
    _write_trial(user_data, active=False)
    allowed, reason = entitlement_gate.may_use_proactive()
    assert allowed is False
    assert reason == "trial_expired"


def test_assert_raises_402_past_trial(gate):
    entitlement_gate, user_data = gate
    _write_trial(user_data, active=False)
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc:
        entitlement_gate.assert_may_use_proactive()
    assert exc.value.status_code == 402


def test_dev_bypass_unlocks_proactive(gate, monkeypatch):
    entitlement_gate, user_data = gate
    _write_trial(user_data, active=False)
    monkeypatch.setenv("EXOSITES_DEV_BYPASS_ENTITLEMENT", "1")
    allowed, reason = entitlement_gate.may_use_proactive()
    assert allowed is True
    assert reason is None


def test_status_exposes_can_use_proactive(gate):
    entitlement_gate, user_data = gate
    _write_trial(user_data, active=True)
    status = entitlement_gate.get_entitlement_status()
    assert "canUseProactive" in status
    assert status["canUseProactive"] is True


def test_no_user_data_dir_allows(monkeypatch):
    monkeypatch.delenv("EXOSITES_DEV_BYPASS_ENTITLEMENT", raising=False)
    monkeypatch.setenv("NODE_ENV", "production")
    monkeypatch.delenv("EXOSITES_USER_DATA", raising=False)
    import entitlement_gate

    importlib.reload(entitlement_gate)
    allowed, reason = entitlement_gate.may_use_proactive()
    assert allowed is True
    assert reason is None
