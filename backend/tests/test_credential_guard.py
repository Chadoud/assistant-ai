"""Credential guard shared by the web-navigator and computer-use agents."""

from __future__ import annotations

import pytest

from actions.credential_guard import (
    enforce_credential_guard,
    is_secret_field,
    looks_like_secret_context,
)


@pytest.mark.parametrize(
    "text",
    [
        "Enter your password",
        "Verification code",
        "One-time code",
        "2FA",
        "Two-factor authentication",
        "Mot de passe",
        "Code de vérification",
        "Please solve the captcha",
    ],
)
def test_looks_like_secret_context_detects_credentials(text):
    assert looks_like_secret_context(text) is True


@pytest.mark.parametrize("text", ["Search", "First name", "Allow access", None, ""])
def test_looks_like_secret_context_ignores_benign(text):
    assert looks_like_secret_context(text) is False


def test_is_secret_field_by_input_type():
    assert is_secret_field("any", "password") is True


def test_is_secret_field_by_name():
    assert is_secret_field("Account password", "text") is True
    assert is_secret_field("Email", "text") is False


def test_computer_use_guard_blocks_type_when_model_flags_sensitive():
    out = enforce_credential_guard(
        {"type": "type", "text": "hunter2", "sensitive": True, "reason": "fill field"}
    )
    assert out["type"] == "needs_user"


def test_computer_use_guard_blocks_type_on_secret_reason():
    out = enforce_credential_guard(
        {"type": "type", "text": "1234", "sensitive": False, "reason": "enter the 2FA code"}
    )
    assert out["type"] == "needs_user"


def test_computer_use_guard_allows_normal_type():
    action = {"type": "type", "text": "hello world", "sensitive": False, "reason": "search query"}
    out = enforce_credential_guard(action)
    assert out["type"] == "type"
    assert out["text"] == "hello world"


def test_computer_use_guard_passes_through_non_type_actions():
    action = {"type": "click", "x": 0.5, "y": 0.5, "reason": "click button"}
    assert enforce_credential_guard(action) is action
