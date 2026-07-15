"""WebSocket voice session emits session_start after accept."""

from __future__ import annotations

import json

import pytest
from starlette.testclient import TestClient

import main


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.delenv("EXOSITES_INSECURE_LOCAL", raising=False)
    monkeypatch.setenv("EXOSITES_APP_TOKEN", "voice-ws-test-token")
    return TestClient(main.app)


def test_voice_ws_emits_session_start_with_valid_token(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Authenticated handshake should yield a session_start frame from run_voice_session."""

    async def fake_run_voice_session(*_args, **_kwargs):
        yield json.dumps({"type": "session_start", "model": "test-model"})

    monkeypatch.setattr("routes.voice_routes.run_voice_session", fake_run_voice_session)

    with client.websocket_connect(
        "/ws/voice?startup=false&memory=false",
        headers={"X-App-Token": "voice-ws-test-token"},
    ) as ws:
        first = ws.receive_text()
        payload = json.loads(first)
        assert payload.get("type") == "session_start"
