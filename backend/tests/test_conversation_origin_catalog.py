"""Tests for conversation origin catalog matching."""

from __future__ import annotations

import json

from conversation_origin_catalog import (
    catalog_from_conversation_messages,
    catalog_from_recap_messages,
    catalog_from_text_hints,
    match_text_to_catalog,
    merge_origin_catalogs,
)


def test_parse_calendar_tool_message() -> None:
    payload = {
        "ok": True,
        "data": {
            "events": [
                {
                    "id": "evt-42",
                    "summary": "Team standup",
                    "html_link": "https://calendar.google.com/event?eid=abc",
                }
            ]
        },
    }
    messages = [
        {"role": "tool", "name": "list_google_calendar_events", "content": json.dumps(payload)},
    ]
    catalog = catalog_from_conversation_messages(messages)
    assert len(catalog) == 1
    assert catalog[0]["origin_ref"] == "google-calendar:cal:evt-42"
    assert catalog[0]["origin_label"] == "Team standup"


def test_match_recap_line_to_task_catalog() -> None:
    task_catalog = [
        {
            "origin_ref": "google-calendar:cal:evt-99",
            "origin_kind": "google_calendar_event",
            "origin_label": "Sport Viki / Iann",
            "origin_url": "https://calendar.google.com/event?eid=99",
            "match_titles": ["sport viki / iann", "prepare for: sport viki / iann"],
        }
    ]
    messages = [
        {
            "role": "assistant",
            "content": "- Prepare for: Sport Viki / Iann\n- Other item",
            "calendar_context": True,
        }
    ]
    recap_entries = catalog_from_recap_messages(messages, task_catalog)
    assert len(recap_entries) == 1
    assert recap_entries[0]["origin_ref"] == "google-calendar:cal:evt-99"


def test_mirror_tool_result_content_trims_calendar_payload() -> None:
    from conversation_origin_catalog import mirror_tool_result_content

    result = {
        "ok": True,
        "data": {
            "events": [
                {
                    "id": "evt-1",
                    "summary": "Standup",
                    "html_link": "https://calendar.google.com/event?eid=1",
                    "description": "x" * 5000,
                }
            ]
        },
    }
    mirrored = mirror_tool_result_content("google_workspace", result)
    assert mirrored is not None
    payload = json.loads(mirrored)
    assert payload["ok"] is True
    assert payload["data"]["events"][0]["summary"] == "Standup"
    assert "description" not in payload["data"]["events"][0]


def test_mirror_tool_result_content_ignores_unrelated_tools() -> None:
    from conversation_origin_catalog import mirror_tool_result_content

    assert mirror_tool_result_content("read_file", {"ok": True, "data": {"content": "hi"}}) is None


def test_text_hints_merge_with_task_catalog() -> None:
    task_catalog = [
        {
            "origin_ref": "gmail:mail:msg-1",
            "origin_kind": "gmail_message",
            "origin_label": "Invoice from Acme Corp March",
            "match_titles": ["invoice from acme corp march"],
        }
    ]
    catalog = merge_origin_catalogs(
        task_catalog, catalog_from_text_hints(["Invoice from Acme Corp March"])
    )
    matched = match_text_to_catalog("Invoice from Acme Corp March", catalog)
    assert matched is not None
    assert matched["origin_ref"] == "gmail:mail:msg-1"
