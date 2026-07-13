"""Tests for deterministic OAuth consent playbooks."""

from __future__ import annotations

from actions.oauth_playbooks import try_playbook_desktop, try_playbook_web


def _el(ref: int, name: str, **extra: str) -> dict:
    return {"ref": ref, "role": "button", "name": name, "text": name, **extra}


def test_google_warning_clicks_advanced_first():
    elements = [
        _el(0, "Advanced"),
        _el(1, "Back to safety"),
    ]
    action = try_playbook_web(
        url="https://accounts.google.com/signin/oauth/warning?authuser=0",
        elements=elements,
        history=[],
    )
    assert action is not None
    assert action["type"] == "click"
    assert action["ref"] == 0
    assert "Advanced" in action["reason"]


def test_google_warning_clicks_unsafe_after_advanced_in_history():
    elements = [
        _el(0, "Advanced"),
        _el(1, "Go to Exosites (unsafe)"),
    ]
    action = try_playbook_web(
        url="https://accounts.google.com/signin/oauth/warning",
        elements=elements,
        history=["click Advanced on warning"],
    )
    assert action is not None
    assert action["type"] == "click"
    assert action["ref"] == 1
    assert "unsafe" in action["reason"].lower()


def test_google_warning_never_clicks_back_to_safety():
    elements = [
        _el(0, "Back to safety"),
        _el(1, "Advanced"),
    ]
    action = try_playbook_web(
        url="https://accounts.google.com/signin/oauth/warning",
        elements=elements,
        history=[],
    )
    assert action is not None
    assert action["ref"] == 1


def test_notion_select_pages_before_grant():
    elements = [
        _el(0, "Select pages"),
        _el(1, "Allow access"),
    ]
    action = try_playbook_web(
        url="https://www.notion.so/install-integration",
        elements=elements,
        history=[],
        provider="Notion",
    )
    assert action is not None
    assert action["type"] == "click"
    assert action["ref"] == 0


def test_microsoft_admin_consent_needs_user():
    action = try_playbook_web(
        url="https://login.microsoftonline.com/common/adminconsent",
        elements=[_el(0, "Need admin approval")],
        history=[],
        provider="Microsoft",
    )
    assert action is not None
    assert action["type"] == "need_user"


def test_desktop_google_warning_gives_exact_handoff():
    action = try_playbook_desktop(
        url="https://accounts.google.com/signin/oauth/warning",
        history=[],
    )
    assert action is not None
    assert action["type"] == "need_user"
    assert "Advanced" in action["reason"]
