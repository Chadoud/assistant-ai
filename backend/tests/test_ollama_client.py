"""Tests for centralized Ollama client (local shim + remote HTTP)."""

from __future__ import annotations

import pathlib
import sys
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import llm.ollama_client as oc  # noqa: E402


@pytest.fixture(autouse=True)
def _reset_slots(monkeypatch):
    monkeypatch.delenv("OLLAMA_API_KEY", raising=False)
    monkeypatch.delenv("EXOSITES_USER_DATA", raising=False)
    oc._slot_semaphore = None
    oc._configured_slot_limit = None
    yield
    oc._slot_semaphore = None
    oc._configured_slot_limit = None


def test_is_remote_mode_default_is_remote(monkeypatch):
    monkeypatch.delenv("OLLAMA_MODE", raising=False)
    monkeypatch.delenv("EXOSITES_REMOTE_LLM", raising=False)
    assert oc.is_remote_mode() is True


def test_is_remote_mode_from_flag(monkeypatch):
    monkeypatch.delenv("OLLAMA_MODE", raising=False)
    monkeypatch.setenv("EXOSITES_REMOTE_LLM", "1")
    assert oc.is_remote_mode() is True


def test_is_remote_mode_from_mode(monkeypatch):
    monkeypatch.delenv("EXOSITES_REMOTE_LLM", raising=False)
    monkeypatch.setenv("OLLAMA_MODE", "remote")
    assert oc.is_remote_mode() is True


def test_local_chat_delegates(monkeypatch):
    monkeypatch.delenv("EXOSITES_REMOTE_LLM", raising=False)
    monkeypatch.setenv("OLLAMA_MODE", "local")
    fake = {"message": {"content": "ok"}}
    with patch("ollama.chat", return_value=fake) as mock_chat:
        out = oc.chat(model="mistral", messages=[{"role": "user", "content": "hi"}])
    assert out == fake
    mock_chat.assert_called_once()


def test_remote_chat_maps_openai_response(monkeypatch):
    monkeypatch.setenv("OLLAMA_MODE", "remote")
    monkeypatch.setenv("OLLAMA_HOST", "https://llm.example.test")
    monkeypatch.setenv("OLLAMA_API_KEY", "sk-test")

    response = MagicMock()
    response.status_code = 200
    response.json.return_value = {
        "choices": [{"message": {"content": "Invoices"}}],
        "usage": {"prompt_tokens": 10, "completion_tokens": 2},
    }

    client = MagicMock()
    client.__enter__.return_value = client
    client.request.return_value = response

    with patch("httpx.Client", return_value=client):
        out = oc.chat(
            model="mistral",
            messages=[{"role": "user", "content": "classify"}],
            options={"temperature": 0.1},
        )

    assert out["message"]["content"] == "Invoices"
    assert out["prompt_eval_count"] == 10
    assert out["eval_count"] == 2
    call_kwargs = client.request.call_args.kwargs
    assert call_kwargs["json"]["model"] == "mistral"
    assert call_kwargs["headers"]["Authorization"] == "Bearer sk-test"


def test_remote_chat_retries_503(monkeypatch):
    monkeypatch.setenv("OLLAMA_MODE", "remote")
    monkeypatch.setenv("OLLAMA_HOST", "https://llm.example.test")
    monkeypatch.setenv("OLLAMA_API_KEY", "sk-test")
    monkeypatch.setenv("OLLAMA_MAX_RETRIES", "1")

    fail = MagicMock()
    fail.status_code = 503
    fail.text = "overloaded"
    fail.headers = {}

    ok = MagicMock()
    ok.status_code = 200
    ok.json.return_value = {
        "choices": [{"message": {"content": "done"}}],
        "usage": {},
    }

    client = MagicMock()
    client.__enter__.return_value = client
    client.request.side_effect = [fail, ok]

    with patch("httpx.Client", return_value=client):
        with patch("time.sleep"):
            out = oc.chat(model="mistral", messages=[{"role": "user", "content": "x"}])

    assert out["message"]["content"] == "done"
    assert client.request.call_count == 2


def test_remote_embeddings(monkeypatch):
    monkeypatch.setenv("OLLAMA_MODE", "remote")
    monkeypatch.setenv("OLLAMA_HOST", "https://llm.example.test")
    monkeypatch.setenv("OLLAMA_API_KEY", "sk-test")

    response = MagicMock()
    response.status_code = 200
    response.json.return_value = {"data": [{"embedding": [0.1, 0.2]}]}

    client = MagicMock()
    client.__enter__.return_value = client
    client.request.return_value = response

    with patch("httpx.Client", return_value=client):
        out = oc.embeddings(model="nomic-embed-text", prompt="hello")

    assert out["embedding"] == [0.1, 0.2]


def test_require_local_admin_raises_in_remote(monkeypatch):
    monkeypatch.setenv("OLLAMA_MODE", "remote")
    with pytest.raises(oc.RemoteOllamaError):
        oc.require_local_admin()


def test_health_check_remote(monkeypatch):
    monkeypatch.setenv("OLLAMA_MODE", "remote")
    monkeypatch.setenv("OLLAMA_HOST", "https://llm.example.test")

    response = MagicMock()
    response.status_code = 200

    client = MagicMock()
    client.__enter__.return_value = client
    client.get.return_value = response

    with patch("httpx.Client", return_value=client):
        out = oc.health_check()

    assert out["ok"] is True
    assert out["mode"] == "remote"


def test_ollama_host_rewrites_blocked_direct_ip_port(monkeypatch):
    monkeypatch.setenv("OLLAMA_MODE", "remote")
    monkeypatch.setenv("OLLAMA_HOST", "http://203.0.113.10:4000")
    assert oc.ollama_host() == "https://llm-staging.exosites.ch"


def test_ollama_host_keeps_https_gateway(monkeypatch):
    monkeypatch.setenv("OLLAMA_MODE", "remote")
    monkeypatch.setenv("OLLAMA_HOST", "https://llm-staging.exosites.ch")
    assert oc.ollama_host() == "https://llm-staging.exosites.ch"


def test_api_key_reads_managed_backend_overrides(monkeypatch, tmp_path):
    ud = tmp_path / "exo"
    ud.mkdir()
    (ud / "backend-env-overrides.json").write_text(
        '{"EXOSITES_SORT_CREDENTIALS_MANAGED":"1","OLLAMA_API_KEY":"sk-from-file"}',
        encoding="utf-8",
    )
    monkeypatch.setenv("EXOSITES_USER_DATA", str(ud))
    monkeypatch.setenv("OLLAMA_API_KEY", "sk-from-env-stale")
    assert oc._api_key() == "sk-from-file"


def test_list_model_names_falls_back_to_local_vision_when_remote_fails(monkeypatch):
    monkeypatch.setenv("OLLAMA_MODE", "remote")
    monkeypatch.setenv("OLLAMA_HOST", "https://llm.example.test")

    with patch.object(oc, "list_models_response", side_effect=oc.OllamaClientError("401")):
        with patch.object(oc, "_local_model_names", return_value=["llava:7b"]):
            names = oc.list_model_names()

    assert "llava:7b" in names


def test_remote_chat_converts_vision_images(monkeypatch):
    monkeypatch.setenv("OLLAMA_MODE", "remote")
    monkeypatch.setenv("OLLAMA_HOST", "https://llm.example.test")
    monkeypatch.setenv("OLLAMA_API_KEY", "sk-test")

    response = MagicMock()
    response.status_code = 200
    response.json.return_value = {
        "choices": [{"message": {"content": "Invoice from Acme"}}],
        "usage": {"prompt_tokens": 100, "completion_tokens": 8},
    }

    client = MagicMock()
    client.__enter__.return_value = client
    client.request.return_value = response

    with patch("httpx.Client", return_value=client):
        out = oc.chat(
            model="moondream",
            messages=[
                {
                    "role": "user",
                    "content": "Describe this document",
                    "images": ["abc123base64"],
                }
            ],
        )

    assert out["message"]["content"] == "Invoice from Acme"
    body = client.request.call_args.kwargs["json"]
    content = body["messages"][0]["content"]
    assert content[0]["type"] == "text"
    assert content[1]["type"] == "image_url"
    assert content[1]["image_url"]["url"] == "data:image/jpeg;base64,abc123base64"


def test_acquire_slot_timeout_raises(monkeypatch):
    monkeypatch.setenv("OLLAMA_MODE", "remote")
    monkeypatch.setenv("OLLAMA_HOST", "https://llm.example.test")
    monkeypatch.setenv("OLLAMA_API_KEY", "sk-test")
    monkeypatch.setenv("EXOSITES_LLM_MAX_SLOTS", "1")
    monkeypatch.setenv("EXOSITES_LLM_SLOT_WAIT_S", "0.01")

    oc._slot_semaphore = __import__("threading").Semaphore(0)
    oc._configured_slot_limit = 1

    with pytest.raises(oc.OllamaClientError, match="busy"):
        oc.chat(model="mistral", messages=[{"role": "user", "content": "hi"}])


def test_direct_request_json_uses_queue_for_chat(monkeypatch):
    monkeypatch.setenv("OLLAMA_MODE", "remote")
    monkeypatch.setenv("OLLAMA_HOST", "https://llm.example.test")
    monkeypatch.setenv("OLLAMA_API_KEY", "sk-test")
    monkeypatch.setenv("EXOSITES_SORT_QUEUE_URL", "https://llm.example.test")

    response = MagicMock()
    response.status_code = 200
    response.json.return_value = {
        "choices": [{"message": {"content": "Invoices"}}],
        "usage": {"prompt_tokens": 3, "completion_tokens": 1},
    }

    client = MagicMock()
    client.__enter__.return_value = client
    client.post.return_value = response

    with patch("httpx.Client", return_value=client):
        out = oc.chat(model="mistral", messages=[{"role": "user", "content": "classify"}])

    assert out["message"]["content"] == "Invoices"
    call_kwargs = client.post.call_args.kwargs
    assert call_kwargs["json"]["path"] == "/v1/chat/completions"
    assert "https://llm.example.test/v1/sort/inference" in str(client.post.call_args)


def test_list_model_names_skips_local_vision_when_managed(monkeypatch, tmp_path):
    ud = tmp_path / "exo"
    ud.mkdir()
    (ud / "backend-env-overrides.json").write_text(
        '{"EXOSITES_SORT_CREDENTIALS_MANAGED":"1","OLLAMA_API_KEY":"sk-from-file"}',
        encoding="utf-8",
    )
    monkeypatch.setenv("EXOSITES_USER_DATA", str(ud))
    monkeypatch.setenv("OLLAMA_MODE", "remote")
    monkeypatch.setenv("OLLAMA_HOST", "https://llm.example.test")

    remote_payload = {
        "models": [{"model": "mistral"}, {"model": "nomic-embed-text"}, {"model": "moondream"}]
    }

    with patch.object(oc, "list_models_response", return_value=remote_payload):
        with patch.object(oc, "_local_model_names", return_value=["llava:7b"]) as local_mock:
            names = oc.list_model_names()

    assert "moondream" in names
    assert "llava:7b" not in names
    local_mock.assert_not_called()


def test_list_model_names_merges_local_vision_in_remote(monkeypatch):
    monkeypatch.setenv("OLLAMA_MODE", "remote")
    monkeypatch.setenv("OLLAMA_HOST", "https://llm.example.test")

    remote_payload = {"models": [{"model": "mistral"}, {"model": "nomic-embed-text"}]}

    with patch.object(oc, "list_models_response", return_value=remote_payload):
        with patch.object(oc, "_local_model_names", return_value=["moondream:latest"]):
            names = oc.list_model_names()

    assert "mistral" in names
    assert "moondream:latest" in names
