"""Tests for Gmail developer-setup checklist logic."""

from __future__ import annotations

import pytest

from gmail_setup_checks import build_gmail_developer_setup_steps


def test_step1_pass_when_oauth_configured() -> None:
    steps = build_gmail_developer_setup_steps(
        oauth_configured=True,
        oauth_env_id_present=True,
        oauth_env_secret_present=True,
        backend_dotenv_file_exists=True,
        user_dotenv_file_exists=False,
        resource_dotenv_file_exists=False,
        oauth_json_path_env_present=False,
        oauth_json_file_at_path_exists=False,
        oauth_default_json_exists=False,
        redirect_uri_effective="http://127.0.0.1:8789/callback",
        gmail_profile_probe_ok=None,
    )
    assert steps[0]["id"] == "client_credentials"
    assert steps[0]["status"] == "pass"
    assert steps[2]["id"] == "json_client_file"
    assert steps[2]["status"] == "skipped"
    assert steps[3]["status"] == "pass"


def test_step1_fail_when_not_configured() -> None:
    steps = build_gmail_developer_setup_steps(
        oauth_configured=False,
        oauth_env_id_present=True,
        oauth_env_secret_present=False,
        backend_dotenv_file_exists=True,
        user_dotenv_file_exists=False,
        resource_dotenv_file_exists=False,
        oauth_json_path_env_present=False,
        oauth_json_file_at_path_exists=False,
        oauth_default_json_exists=False,
        redirect_uri_effective="http://127.0.0.1:8789/callback",
        gmail_profile_probe_ok=None,
    )
    assert steps[0]["status"] == "fail"
    assert steps[3]["status"] == "fail"


def test_json_step_fail_when_json_present_but_invalid_credentials() -> None:
    steps = build_gmail_developer_setup_steps(
        oauth_configured=False,
        oauth_env_id_present=False,
        oauth_env_secret_present=False,
        backend_dotenv_file_exists=False,
        user_dotenv_file_exists=False,
        resource_dotenv_file_exists=False,
        oauth_json_path_env_present=True,
        oauth_json_file_at_path_exists=True,
        oauth_default_json_exists=False,
        redirect_uri_effective="",
        gmail_profile_probe_ok=None,
    )
    assert steps[2]["status"] == "fail"


def test_gmail_api_step_pass_when_probe_ok() -> None:
    steps = build_gmail_developer_setup_steps(
        oauth_configured=True,
        oauth_env_id_present=True,
        oauth_env_secret_present=True,
        backend_dotenv_file_exists=True,
        user_dotenv_file_exists=False,
        resource_dotenv_file_exists=False,
        oauth_json_path_env_present=False,
        oauth_json_file_at_path_exists=False,
        oauth_default_json_exists=False,
        redirect_uri_effective="http://127.0.0.1:8789/callback",
        gmail_profile_probe_ok=True,
    )
    assert steps[4]["id"] == "gmail_api_enabled"
    assert steps[4]["status"] == "pass"


@pytest.mark.parametrize(
    ("uri", "expect_loopback"),
    [
        ("http://127.0.0.1:8789/callback", True),
        ("http://localhost:8789/callback", True),
        ("https://example.com/cb", False),
    ],
)
def test_redirect_loopback_detection(uri: str, expect_loopback: bool) -> None:
    steps = build_gmail_developer_setup_steps(
        oauth_configured=True,
        oauth_env_id_present=True,
        oauth_env_secret_present=True,
        backend_dotenv_file_exists=True,
        user_dotenv_file_exists=False,
        resource_dotenv_file_exists=False,
        oauth_json_path_env_present=False,
        oauth_json_file_at_path_exists=False,
        oauth_default_json_exists=False,
        redirect_uri_effective=uri,
        gmail_profile_probe_ok=None,
    )
    assert steps[3]["hints"]["loopback_redirect_ok"] is expect_loopback
    if expect_loopback:
        assert steps[3]["status"] == "pass"
    else:
        assert steps[3]["status"] == "manual"
