"""Integration tests for expanded local privacy wipe."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from connector_credentials import clear_all_tokens, list_connected_providers, store_token
from privacy_wipe import wipe_local_user_data


@pytest.fixture(autouse=True)
def _isolate_token_cache() -> None:
    clear_all_tokens()
    yield
    clear_all_tokens()


def test_wipe_clears_connector_token_cache() -> None:
    store_token("google", "tok-test", 3600)
    assert "google" in list_connected_providers()

    with patch("assistant_memory.clear_all_memory"), patch(
        "conversation_store.clear_all_conversations", return_value=0
    ), patch("tasks_store.clear_all_tasks", return_value=0), patch(
        "activity_store.clear_activity"
    ), patch("orchestrator.audit.clear_all"), patch(
        "orchestrator.memory.clear_all"
    ), patch("orchestrator.skills.clear_all"), patch(
        "meeting_store.clear_all_active_meetings", return_value=0
    ), patch("whatsapp_event_store.clear_events_for_tests"):
        result = wipe_local_user_data()

    assert result["ok"] is True
    assert "connector_tokens" in result["cleared"]
    assert list_connected_providers() == []


def test_clear_all_tokens_removes_cached_providers() -> None:
    store_token("dropbox", "dbx", 0)
    clear_all_tokens()
    assert list_connected_providers() == []
