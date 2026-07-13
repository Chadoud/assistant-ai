"""Tests for manage_connection provider targeting and hints."""

from __future__ import annotations

from actions.manage_connection import manage_connection


def test_missing_scope_targets_google_calendar():
    result = manage_connection(
        {
            "operation": "connect",
            "provider": "Google",
            "missing_scope": "calendar",
        }
    )
    assert result["ok"] is True
    assert result["data"]["provider_id"] == "google-calendar"


def test_calendar_in_provider_name():
    result = manage_connection(
        {"operation": "connect", "provider": "my Google calendar"},
    )
    assert result["ok"] is True
    assert result["data"]["provider_id"] == "google-calendar"


def test_connect_hint_does_not_mention_control_computer():
    result = manage_connection({"operation": "connect", "provider": "Gmail"})
    assert result["ok"] is True
    hint = result.get("hint", "")
    assert "control_computer" not in hint.lower()
    assert result["data"].get("connect_id")


def test_connect_includes_orchestrator_context():
    result = manage_connection({"operation": "connect", "provider": "Notion"})
    assert result["ok"] is True
    assert "connect_id" in result["data"]
    assert "seed_history" in result["data"]


def test_whatsapp_connect_opens_setup_modal():
    result = manage_connection({"operation": "connect", "provider": "WhatsApp"})
    assert result["ok"] is True
    assert result["data"]["action"] == "open_whatsapp_setup"
    assert result["data"]["provider_id"] == "whatsapp"
    assert "connect_id" not in result["data"]


def test_whatsapp_disconnect_uses_integration_disconnect():
    result = manage_connection({"operation": "disconnect", "provider": "WhatsApp"})
    assert result["ok"] is True
    assert result["data"]["action"] == "integration_disconnect"
    assert result["data"]["provider_id"] == "whatsapp"
