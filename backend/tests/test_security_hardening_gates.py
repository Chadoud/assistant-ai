"""M4.3 — focused security regression gates (voice auth, path guard, approvals)."""

from __future__ import annotations

import pytest
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

import main
from output_dir_guard import is_safe_output_dir
from tool_registry.dispatch import dispatch_sync
from tool_registry.risk_tiers import APPROVAL_TOOLS


@pytest.fixture
def voice_client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.delenv("EXOSITES_INSECURE_LOCAL", raising=False)
    monkeypatch.setenv("EXOSITES_APP_TOKEN", "security-gate-token")
    return TestClient(main.app)


def test_voice_rejects_query_token(
    voice_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """M2.5: ``?token=`` must not authenticate."""
    import voice_ws_auth

    monkeypatch.setattr(voice_ws_auth, "AUTH_MESSAGE_TIMEOUT_S", 0.05)
    with voice_client.websocket_connect("/ws/voice?token=security-gate-token") as ws:
        with pytest.raises(WebSocketDisconnect) as exc_info:
            ws.receive_text()
    assert exc_info.value.code == 4401


def test_path_guard_rejects_user_data_and_settings_secrets(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    """M2.8: EXOSITES_USER_DATA and settings_secrets_v1 are not valid output dirs."""
    ud = tmp_path / "ExoUserData"
    ud.mkdir()
    secrets = ud / "settings_secrets_v1"
    secrets.mkdir()
    monkeypatch.setenv("EXOSITES_USER_DATA", str(ud))

    ok_ud, _ = is_safe_output_dir(str(ud))
    assert not ok_ud
    ok_secrets, _ = is_safe_output_dir(str(secrets))
    assert not ok_secrets


@pytest.mark.parametrize(
    "tool_name",
    [
        "control_computer",
        "file_workspace",
        "start_local_file_sort",
        "send_message",
    ],
)
def test_approval_tools_denied_without_approval(tool_name: str) -> None:
    """M3.1: approval-tier tools deny when approval_granted is false."""
    assert tool_name in APPROVAL_TOOLS
    result = dispatch_sync(tool_name, {}, approval_granted=False)
    assert result["ok"] is False
    assert "approval" in result["error"].lower()
