"""Tests for voice session error classification (auth vs transient transport)."""

from voice.errors import (
    is_api_key_error,
    is_live_audio_config_error,
    is_quota_exhausted_error,
    is_transient_connection_error,
)
from voice.model import GEMINI_VOICE_MODEL_DEFAULT, resolve_gemini_voice_model


class _WsCloseError(Exception):
    """Minimal stand-in for websockets close errors with a numeric code."""

    def __init__(self, code: int, message: str = "") -> None:
        super().__init__(message or f"closed with code {code}")
        self.code = code


class _ConnectionClosed(Exception):
    """Name matches websockets ConnectionClosed so type-name heuristics apply."""

    def __init__(self, code: int, message: str) -> None:
        super().__init__(message)
        self.code = code


def test_api_key_error_explicit_messages():
    assert is_api_key_error("API key not valid. Please pass a valid API key.") is True
    assert is_api_key_error("invalid api key") is True
    assert is_api_key_error("Error: api_key_invalid") is True
    assert is_api_key_error("GEMINI_API_KEY not configured.") is True


def test_api_key_error_1007_requires_key_wording():
    assert is_api_key_error("1007 API key not valid") is True
    assert is_api_key_error("WebSocket closed with code 1007: invalid payload") is False


def test_transient_connection_error_ws_close_codes():
    for code in (1001, 1006, 1011, 1014):
        assert is_transient_connection_error(_WsCloseError(code)) is True


def test_transient_connection_error_network_exceptions():
    assert is_transient_connection_error(ConnectionError("connection reset")) is True
    assert is_transient_connection_error(TimeoutError()) is True
    assert is_transient_connection_error(OSError("semaphore timeout")) is True


def test_transient_connection_error_message_tokens():
    assert is_transient_connection_error(Exception("handshake timed out")) is True
    assert is_transient_connection_error(Exception("abnormal closure")) is True
    assert is_transient_connection_error(Exception("503 temporarily unavailable")) is True


def test_transient_connection_error_cause_chain():
    root = ConnectionError("connection reset")
    wrapped = RuntimeError("voice session failed")
    wrapped.__cause__ = root
    assert is_transient_connection_error(wrapped) is True


def test_non_transient_generic_error():
    assert is_transient_connection_error(ValueError("bad tool args")) is False


def test_audio_config_1007_is_not_transient_even_when_named_connection_closed():
    exc = _ConnectionClosed(
        1007,
        "1007 None. The audio content type (CONTENT_TYPE_AUDIO) is not supported "
        "for this model configuration.",
    )
    assert is_live_audio_config_error(exc) is True
    assert is_transient_connection_error(exc) is False


def test_resolve_gemini_voice_model_remaps_chat_flash():
    assert resolve_gemini_voice_model("gemini-2.5-flash") == GEMINI_VOICE_MODEL_DEFAULT
    assert resolve_gemini_voice_model("models/gemini-2.5-flash-native-audio-latest") == (
        GEMINI_VOICE_MODEL_DEFAULT
    )


def test_quota_exhausted_error_matches_free_tier_chain():
    root = Exception("429 RESOURCE_EXHAUSTED: GenerateRequestsPerDay free_tier limit")
    wrapped = RuntimeError("voice session failed")
    wrapped.__cause__ = root
    assert is_quota_exhausted_error(wrapped) is True


def test_quota_exhausted_error_ignores_generic_failure():
    assert is_quota_exhausted_error(RuntimeError("1011 internal error")) is False
