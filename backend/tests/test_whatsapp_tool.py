"""Tests for WhatsApp Business Cloud API connector."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from actions import whatsapp_tool
from connector_credentials import CredentialUnavailableError


def test_normalize_recipient_e164() -> None:
    assert whatsapp_tool.normalize_recipient_e164("mom") is None
    assert whatsapp_tool.normalize_recipient_e164("+41 79 123 45 67") == "41791234567"


def test_friendly_whatsapp_error_template_required() -> None:
    msg = whatsapp_tool._friendly_whatsapp_error("Error 131026 template required")
    assert "template" in msg.lower()


def test_friendly_whatsapp_error_invalid_token() -> None:
    msg = whatsapp_tool._friendly_whatsapp_error("190 Invalid OAuth access token")
    assert "External sources" in msg


def test_connection_status_not_configured() -> None:
    with patch.object(whatsapp_tool, "load_whatsapp_config", return_value=None):
        out = whatsapp_tool.whatsapp_messaging({"operation": "connection_status"})
    assert out["ok"] is True
    assert out["data"]["business_api_configured"] is False


def test_send_text_missing_fields() -> None:
    out = whatsapp_tool.whatsapp_messaging({"operation": "send_text", "to": "", "text": ""})
    assert out["ok"] is False


def test_send_text_success() -> None:
    from whatsapp_event_store import SessionCheck

    with patch.object(
        whatsapp_tool,
        "session_check",
        return_value=SessionCheck(open=True, last_inbound_ms=None, reason="ok"),
    ):
        with patch.object(
            whatsapp_tool,
            "try_send_whatsapp_cloud",
            return_value=(True, None, {"message_id": "m1"}),
        ):
            out = whatsapp_tool.whatsapp_messaging(
                {"operation": "send_text", "to": "+41791234567", "text": "Hello"}
            )
    assert out["ok"] is True
    assert out["data"]["method"] == "whatsapp_cloud_api"


def test_send_text_blocks_closed_session() -> None:
    from whatsapp_event_store import SessionCheck

    with patch.object(
        whatsapp_tool,
        "session_check",
        return_value=SessionCheck(open=False, last_inbound_ms=None, reason="closed"),
    ):
        out = whatsapp_tool.whatsapp_messaging(
            {"operation": "send_text", "to": "+41791234567", "text": "Hello"}
        )
    assert out["ok"] is False
    assert out["data"]["session_open"] is False


def test_send_text_not_configured() -> None:
    with patch.object(
        whatsapp_tool,
        "try_send_whatsapp_cloud",
        return_value=(False, "cloud_api_not_configured", None),
    ):
        out = whatsapp_tool.whatsapp_messaging(
            {"operation": "send_text", "to": "+41791234567", "text": "Hello"}
        )
    assert out["ok"] is False


def test_list_templates_requires_waba_id() -> None:
    cfg = {"phone_number_id": "123", "access_token": "tok", "business_account_id": ""}
    with patch.object(whatsapp_tool, "_credentials", return_value=cfg):
        out = whatsapp_tool.whatsapp_messaging({"operation": "list_templates"})
    assert out["ok"] is False
    assert "Business Account ID" in out["error"]


def test_list_templates_success() -> None:
    cfg = {"phone_number_id": "123", "access_token": "tok", "business_account_id": "waba1"}
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.content = json.dumps(
        {"data": [{"name": "hello_world", "language": "en", "status": "APPROVED"}]}
    ).encode()
    mock_response.json.return_value = {
        "data": [{"name": "hello_world", "language": "en", "status": "APPROVED", "category": "UTILITY"}]
    }

    with patch.object(whatsapp_tool, "_credentials", return_value=cfg):
        with patch("actions.whatsapp_tool.httpx.get", return_value=mock_response):
            out = whatsapp_tool.whatsapp_messaging({"operation": "list_templates"})
    assert out["ok"] is True
    assert out["data"]["count"] == 1


def test_load_whatsapp_config_from_connector_credentials() -> None:
    token = json.dumps(
        {"phone_number_id": "pn1", "access_token": "tok", "business_account_id": "waba"}
    )
    with patch("actions.whatsapp_tool.try_get_token", return_value=token):
        cfg = whatsapp_tool.load_whatsapp_config()
    assert cfg is not None
    assert cfg["phone_number_id"] == "pn1"


def test_credentials_raises_when_missing() -> None:
    with patch.object(whatsapp_tool, "load_whatsapp_config", return_value=None):
        with pytest.raises(CredentialUnavailableError):
            whatsapp_tool._credentials()
