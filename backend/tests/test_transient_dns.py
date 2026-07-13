"""Network / DNS errors must be classified transient so they relay + retry."""

from __future__ import annotations

import pytest

from orchestrator.health import is_transient_error


@pytest.mark.parametrize(
    "message",
    [
        # The exact Windows DNS failure from the production log.
        "Anthropic request failed: [Errno 11001] getaddrinfo failed",
        "Gemini chat stream failed: Server disconnected without sending a response.",
        "Temporary failure in name resolution",
        "Name or service not known",
        "getaddrinfo ENOTFOUND api.anthropic.com",
        "EAI_AGAIN",
        "Network is unreachable",
        "Connection reset by peer",
        "429 Too Many Requests",
        "Service temporarily unavailable",
    ],
)
def test_network_errors_are_transient(message: str) -> None:
    assert is_transient_error(message) is True


@pytest.mark.parametrize(
    "message",
    [
        "API key not valid. Please pass a valid API key.",
        "400 Bad Request: invalid model",
        "Unauthorized",
        "",
    ],
)
def test_auth_and_validation_errors_are_not_transient(message: str) -> None:
    assert is_transient_error(message) is False
