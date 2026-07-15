"""Tests for voice WebSocket app-token authentication."""

from __future__ import annotations

import pytest
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

import main


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.delenv("EXOSITES_INSECURE_LOCAL", raising=False)
    monkeypatch.setenv("EXOSITES_APP_TOKEN", "voice-ws-test-token")
    return TestClient(main.app)


def test_voice_ws_rejects_when_app_auth_never_sent(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import voice_ws_auth

    monkeypatch.setattr(voice_ws_auth, "AUTH_MESSAGE_TIMEOUT_S", 0.05)
    with client.websocket_connect("/ws/voice") as ws:
        with pytest.raises(WebSocketDisconnect) as exc_info:
            ws.receive_text()
    assert exc_info.value.code == 4401


def test_voice_ws_rejects_query_token(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """M2.5: ?token= must not authenticate (even with a valid secret)."""
    import voice_ws_auth

    monkeypatch.setattr(voice_ws_auth, "AUTH_MESSAGE_TIMEOUT_S", 0.05)
    with client.websocket_connect("/ws/voice?token=voice-ws-test-token") as ws:
        with pytest.raises(WebSocketDisconnect) as exc_info:
            ws.receive_text()
    assert exc_info.value.code == 4401


def test_voice_ws_accepts_header_token(client: TestClient) -> None:
    with client.websocket_connect(
        "/ws/voice",
        headers={"X-App-Token": "voice-ws-test-token"},
    ) as ws:
        ws.close()


def test_voice_ws_accepts_app_auth_frame(client: TestClient) -> None:
    with client.websocket_connect("/ws/voice") as ws:
        ws.send_json({"type": "app_auth", "token": "voice-ws-test-token"})
        ws.close()


def test_voice_ws_rejects_invalid_app_auth_frame(client: TestClient) -> None:
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/ws/voice") as ws:
            ws.send_json({"type": "app_auth", "token": "wrong-token"})
            ws.receive_text()
    assert exc_info.value.code == 4401
