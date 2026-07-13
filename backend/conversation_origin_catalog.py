"""
Build origin catalogs from synced tasks and conversation hints for memory linking.
"""

from __future__ import annotations

import json
import logging
import re
from difflib import SequenceMatcher
from typing import Any

import tasks_store
from origin_refs import origin_from_task, parse_external_id

logger = logging.getLogger(__name__)

_MIN_MATCH_SCORE = 0.72
_LINE_PREFIX = re.compile(r"^[\s\-*•·>\d.)]+")
_MAX_MIRROR_EVENTS = 30
_MAX_MIRROR_MESSAGES = 30
_MAX_MIRROR_JSON_CHARS = 24_000


def _normalize_title(text: str) -> str:
    t = _LINE_PREFIX.sub("", text.strip().lower())
    t = re.sub(r"\s+", " ", t)
    if t.startswith("prepare for: "):
        t = t[len("prepare for: ") :]
    if t.startswith("commitment: "):
        t = t[len("commitment: ") :]
    return t.strip()


def _similar(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    if a in b or b in a:
        return 0.86
    return SequenceMatcher(None, a, b).ratio()


def build_task_origin_catalog() -> list[dict[str, Any]]:
    """All integration tasks with resolvable external_id → origin envelope."""
    catalog: list[dict[str, Any]] = []
    try:
        tasks = tasks_store.list_tasks(include_completed=True, exclude_manual=True)
    except Exception:
        logger.debug("task list failed building origin catalog", exc_info=True)
        return catalog
    for task in tasks:
        ext = str(task.get("external_id") or "").strip()
        if not ext or not parse_external_id(ext):
            continue
        fields = origin_from_task(task)
        if not fields:
            continue
        desc = _normalize_title(str(task.get("description") or ""))
        label = _normalize_title(str(fields.get("origin_label") or desc))
        catalog.append(
            {
                **fields,
                "match_titles": list(
                    {desc, label, str(task.get("description") or "").strip()} - {""}
                ),
            }
        )
    return catalog


def is_origin_mirror_tool_name(tool_name: str) -> bool:
    """Whether a tool's JSON result may contain mail/calendar origin refs."""
    name = tool_name.lower()
    return any(token in name for token in ("calendar", "mail", "graph", "workspace"))


def mirror_tool_result_content(tool_name: str, result: Any) -> str | None:
    """Trim a successful tool result for durable origin catalog storage."""
    if not is_origin_mirror_tool_name(tool_name):
        return None
    if not isinstance(result, dict) or not result.get("ok"):
        return None
    data = result.get("data")
    if not isinstance(data, dict):
        return None
    trimmed_data: dict[str, Any] = {}
    events = data.get("events")
    if isinstance(events, list):
        trimmed_data["events"] = [
            {
                "id": ev.get("id"),
                "summary": ev.get("summary") or ev.get("subject"),
                "subject": ev.get("subject"),
                "html_link": ev.get("html_link") or ev.get("htmlLink"),
                "web_link": ev.get("web_link") or ev.get("webLink"),
            }
            for ev in events[:_MAX_MIRROR_EVENTS]
            if isinstance(ev, dict)
        ]
    messages = data.get("messages")
    if isinstance(messages, list):
        trimmed_data["messages"] = [
            {"id": msg.get("id"), "subject": msg.get("subject")}
            for msg in messages[:_MAX_MIRROR_MESSAGES]
            if isinstance(msg, dict)
        ]
    if not trimmed_data:
        return None
    text = json.dumps({"ok": True, "data": trimmed_data}, ensure_ascii=False, default=str)
    if len(text) > _MAX_MIRROR_JSON_CHARS:
        return text[:_MAX_MIRROR_JSON_CHARS]
    return text


def _parse_tool_message_content(content: str) -> list[dict[str, Any]]:
    """Extract mail/calendar items from a tool result JSON payload."""
    items: list[dict[str, Any]] = []
    try:
        payload = json.loads(content)
    except json.JSONDecodeError:
        return items
    if not isinstance(payload, dict) or not payload.get("ok"):
        return items
    data = payload.get("data")
    if not isinstance(data, dict):
        return items
    events = data.get("events")
    if isinstance(events, list):
        for ev in events:
            if not isinstance(ev, dict):
                continue
            event_id = str(ev.get("id") or "").strip()
            title = str(ev.get("summary") or ev.get("subject") or "").strip()
            if not event_id or not title:
                continue
            source = "google-calendar" if "html_link" in ev else "outlook-calendar"
            ext = f"{source}:cal:{event_id}"
            url = str(ev.get("html_link") or ev.get("web_link") or "").strip() or None
            items.append({"origin_ref": ext, "origin_label": title, "origin_url": url})
    messages = data.get("messages")
    if isinstance(messages, list):
        for msg in messages:
            if not isinstance(msg, dict):
                continue
            mid = str(msg.get("id") or "").strip()
            subject = str(msg.get("subject") or "").strip()
            if not mid or not subject:
                continue
            items.append(
                {
                    "origin_ref": f"gmail:mail:{mid}",
                    "origin_label": subject,
                    "origin_url": None,
                }
            )
    return items


def catalog_from_conversation_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Parse stored tool-role messages into origin catalog entries."""
    catalog: list[dict[str, Any]] = []
    for msg in messages:
        if str(msg.get("role", "")).lower() != "tool":
            continue
        name = str(msg.get("name") or "").lower()
        if (
            "calendar" not in name
            and "mail" not in name
            and "graph" not in name
            and "workspace" not in name
        ):
            continue
        content = str(msg.get("content") or "")
        for item in _parse_tool_message_content(content):
            label = _normalize_title(str(item.get("origin_label") or ""))
            catalog.append({**item, "match_titles": [label] if label else []})
    return catalog


def catalog_from_text_hints(hints: list[str]) -> list[dict[str, Any]]:
    """Placeholder entries from UI-provided subject/title lines (matched later)."""
    return [
        {"hint": _normalize_title(h), "match_titles": [_normalize_title(h)]}
        for h in hints
        if h and len(h.strip()) >= 6
    ]


def merge_origin_catalogs(*catalogs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: dict[str, dict[str, Any]] = {}
    for catalog in catalogs:
        for entry in catalog:
            ref = str(entry.get("origin_ref") or entry.get("hint") or "").strip()
            key = ref or str(entry.get("origin_label") or entry.get("hint") or "")
            if not key:
                continue
            if key not in merged:
                merged[key] = dict(entry)
                continue
            existing = merged[key]
            for field in (
                "origin_ref",
                "origin_url",
                "origin_label",
                "origin_kind",
                "linked_task_id",
            ):
                if not existing.get(field) and entry.get(field):
                    existing[field] = entry[field]
            titles = set(existing.get("match_titles") or []) | set(entry.get("match_titles") or [])
            existing["match_titles"] = list(titles)
    return list(merged.values())


def match_text_to_catalog(text: str, catalog: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Find the best catalog entry for a memory key/value string."""
    needle = _normalize_title(text)
    if len(needle) < 4:
        return None
    best: tuple[float, dict[str, Any]] | None = None
    for entry in catalog:
        titles = entry.get("match_titles") or []
        if entry.get("origin_label"):
            titles = list(titles) + [_normalize_title(str(entry["origin_label"]))]
        for title in titles:
            score = _similar(needle, str(title))
            if score >= _MIN_MATCH_SCORE and (best is None or score > best[0]):
                best = (score, entry)
    if not best:
        return None
    entry = dict(best[1])
    entry.pop("hint", None)
    entry.pop("match_titles", None)
    if entry.get("origin_ref"):
        from origin_refs import origin_from_external_ref_string

        normalized = origin_from_external_ref_string(
            str(entry["origin_ref"]),
            label=str(entry.get("origin_label") or ""),
            cached_url=str(entry.get("origin_url") or "") or None,
        )
        if normalized:
            return normalized
    return None


def catalog_from_recap_messages(
    messages: list[dict[str, Any]],
    task_catalog: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Match calendar/mail recap assistant lines to synced tasks."""
    entries: list[dict[str, Any]] = []
    for msg in messages:
        if not msg.get("calendar_context") and not msg.get("mail_recap"):
            continue
        content = str(msg.get("content") or "")
        for line in content.splitlines():
            line = line.strip()
            if len(line) < 8:
                continue
            matched = match_text_to_catalog(line, task_catalog)
            if matched:
                entries.append(matched)
    return entries


def resolve_origin_for_memory_text(
    text: str,
    *,
    catalog: list[dict[str, Any]],
) -> dict[str, Any] | None:
    """Match memory key/value against merged origin catalog."""
    return match_text_to_catalog(text, catalog)
