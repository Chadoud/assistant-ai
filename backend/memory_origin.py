"""
Resolve Memory row open targets and lazy-match origins from linked tasks.
"""

from __future__ import annotations

import logging
import re
from typing import Any

import tasks_store
from origin_refs import (
    ORIGIN_CONVERSATION,
    ORIGIN_MEETING,
    OpenTarget,
    build_url_from_external_ref,
    origin_from_external_ref_string,
    origin_from_task,
    parse_external_id,
    provider_label_from_kind,
)

logger = logging.getLogger(__name__)

_PREPARE_FOR = re.compile(r"^Prepare for:\s*(.+)$", re.IGNORECASE)
_COMMITMENT = re.compile(r"^Commitment:\s*(.+)$", re.IGNORECASE)


def _entry_origin_fields(entry: dict[str, Any]) -> dict[str, Any]:
    return {
        "origin_kind": entry.get("origin_kind"),
        "origin_ref": entry.get("origin_ref"),
        "origin_url": entry.get("origin_url"),
        "origin_label": entry.get("origin_label"),
        "linked_task_id": entry.get("linked_task_id"),
        "conversation_id": entry.get("conversation_id"),
    }


def _match_task_for_memory(entry: dict[str, Any]) -> dict[str, Any] | None:
    """Find a synced task that likely produced this memory text."""
    key = str(entry.get("key") or "").strip()
    value = str(entry.get("value") or "").strip()
    candidates: list[str] = []
    for text in (value, key):
        m = _PREPARE_FOR.match(text)
        if m:
            candidates.append(f"Prepare for: {m.group(1).strip()}")
        m = _COMMITMENT.match(text)
        if m:
            candidates.append(f"Commitment: {m.group(1).strip()[:48]}")
        if text.startswith("Prepare for:"):
            candidates.append(text[:500])
    if value and value not in candidates:
        candidates.append(value[:500])
    if not candidates:
        return None
    try:
        tasks = tasks_store.list_tasks(include_completed=True, exclude_manual=True)
    except Exception:
        logger.debug("task list failed during memory origin match", exc_info=True)
        return None
    for task in tasks:
        desc = str(task.get("description") or "").strip()
        ext = str(task.get("external_id") or "").strip()
        if not ext or not parse_external_id(ext):
            continue
        for needle in candidates:
            if desc == needle or desc.startswith(needle) or needle.startswith(desc):
                return task
            title = needle
            if title.startswith("Prepare for: "):
                title = title[len("Prepare for: ") :]
            if desc == f"Prepare for: {title}":
                return task
    return None


def try_backfill_memory_origin(
    entry: dict[str, Any], *, persist: bool = True
) -> dict[str, Any] | None:
    """
    Infer origin from linked task, origin catalog, or fuzzy match; optionally persist on the row.
    """
    from conversation_origin_catalog import (
        build_task_origin_catalog,
        resolve_origin_for_memory_text,
    )

    ref = str(entry.get("origin_ref") or "").strip()
    if ref and parse_external_id(ref):
        return None
    if ref.startswith("meeting:"):
        return None

    task_catalog = build_task_origin_catalog()
    for text in (
        str(entry.get("value") or ""),
        str(entry.get("key") or ""),
        f"{entry.get('key', '')} {entry.get('value', '')}",
    ):
        matched = resolve_origin_for_memory_text(text, catalog=task_catalog)
        if matched:
            if persist and entry.get("id"):
                _persist_origin(int(entry["id"]), matched)
            return matched

    if entry.get("origin_kind") and ref and not ref.startswith("conv:"):
        return None
    task: dict[str, Any] | None = None
    linked_id = entry.get("linked_task_id")
    if linked_id:
        try:
            task = tasks_store.get_task(int(linked_id))
        except Exception:
            task = None
    if not task:
        task = _match_task_for_memory(entry)
    if not task:
        if entry.get("conversation_id") and entry.get("provenance") == "chat":
            from origin_refs import origin_from_conversation

            fields = origin_from_conversation(str(entry["conversation_id"]))
            if persist and entry.get("id"):
                _persist_origin(int(entry["id"]), fields)
            return fields
        return None
    fields = origin_from_task(task)
    if not fields:
        return None
    if persist and entry.get("id"):
        _persist_origin(int(entry["id"]), fields)
    return fields


def _persist_origin(row_id: int, fields: dict[str, Any]) -> None:
    from assistant_memory import update_memory_origin

    update_memory_origin(row_id, fields)


def resolve_memory_open_target(
    entry: dict[str, Any], *, allow_backfill: bool = True
) -> OpenTarget | None:
    """Resolve how the UI should open this memory row."""
    from origin_url_refresh import refresh_origin_url

    row = dict(entry)
    if allow_backfill:
        ref = str(row.get("origin_ref") or "")
        if not ref or ref.startswith("conv:") or ref.startswith("meeting:"):
            backfill = try_backfill_memory_origin(row, persist=True)
            if backfill:
                row.update(backfill)

    kind = str(row.get("origin_kind") or "").strip()
    label = str(row.get("origin_label") or "").strip()
    origin_ref = str(row.get("origin_ref") or "").strip()
    origin_url = str(row.get("origin_url") or "").strip() or None

    if kind == ORIGIN_CONVERSATION or origin_ref.startswith("conv:"):
        conv_id = (
            origin_ref.removeprefix("conv:")
            if origin_ref.startswith("conv:")
            else row.get("conversation_id")
        )
        if conv_id:
            return OpenTarget(
                kind=ORIGIN_CONVERSATION,
                label=label or "Chat",
                conversation_id=str(conv_id),
            )
        return None

    if kind == ORIGIN_MEETING or origin_ref.startswith("meeting:"):
        meeting_id = (
            origin_ref.removeprefix("meeting:")
            if origin_ref.startswith("meeting:")
            else None
        )
        if meeting_id:
            return OpenTarget(
                kind=ORIGIN_MEETING,
                label=label or "Meeting",
                meeting_id=meeting_id,
            )
        return None

    if origin_ref:
        refreshed = refresh_origin_url(origin_ref, cached_url=origin_url)
        if refreshed and refreshed != origin_url and row.get("id"):
            _persist_origin(int(row["id"]), {"origin_url": refreshed})
            origin_url = refreshed
        url = build_url_from_external_ref(origin_ref, cached_url=origin_url)
        if url:
            display = label or provider_label_from_kind(kind or "task")
            provider = provider_label_from_kind(kind) if kind else "Source"
            if label and label.lower() not in provider.lower():
                display = f"{provider} · {label}"
            else:
                display = provider if not label else f"{provider} · {label}"
            return OpenTarget(kind=kind or "external", label=display, url=url)

    linked_id = row.get("linked_task_id")
    if linked_id:
        try:
            task = tasks_store.get_task(int(linked_id))
        except Exception:
            task = None
        if task:
            fields = origin_from_task(task)
            url = fields.get("origin_url")
            if url:
                return OpenTarget(
                    kind=str(fields.get("origin_kind") or "task"),
                    label=str(fields.get("origin_label") or task.get("description") or "Task"),
                    url=str(url),
                    task_id=int(task["id"]),
                )

    conv_id = row.get("conversation_id")
    if conv_id and row.get("source") == "auto":
        return OpenTarget(
            kind=ORIGIN_CONVERSATION,
            label="Chat",
            conversation_id=str(conv_id),
        )
    return None


def backfill_all_memory_origins(*, dry_run: bool = True) -> dict[str, Any]:
    """Scan memories without origin_ref and attempt lazy matching."""
    from assistant_memory import list_all_memory_scoped

    entries = list_all_memory_scoped()
    matched = 0
    ids: list[int] = []
    for entry in entries:
        if entry.get("origin_ref"):
            continue
        fields = try_backfill_memory_origin(entry, persist=not dry_run)
        if fields:
            matched += 1
            ids.append(int(entry["id"]))
    return {"ok": True, "dry_run": dry_run, "matched": matched, "ids": ids[:50]}


def resolve_task_open_target(task: dict[str, Any]) -> OpenTarget | None:
    """Resolve external open URL for a synced task."""
    from origin_url_refresh import refresh_origin_url

    fields = origin_from_task(task)
    ext = str(task.get("external_id") or "").strip()
    task_source_url = str(task.get("source_url") or "").strip() or None
    if ext:
        refreshed = refresh_origin_url(ext, cached_url=task_source_url)
        if refreshed:
            fields = {**fields, "origin_url": refreshed}
            if refreshed != task_source_url and task.get("id") is not None:
                try:
                    tasks_store.set_task_source_url(int(task["id"]), refreshed)
                except Exception:
                    logger.debug("failed to persist refreshed task source_url", exc_info=True)
    url = build_url_from_external_ref(
        ext,
        cached_url=str(fields.get("origin_url") or "") or None,
    ) if ext else fields.get("origin_url")
    if url:
        kind = str(fields.get("origin_kind") or "task")
        label = str(fields.get("origin_label") or task.get("description") or "Task")
        return OpenTarget(
            kind=kind,
            label=label,
            url=str(url),
            task_id=int(task["id"]) if task.get("id") is not None else None,
        )
    conv_id = task.get("source_conversation_id")
    if conv_id:
        return OpenTarget(
            kind=ORIGIN_CONVERSATION,
            label="Chat",
            conversation_id=str(conv_id),
        )
    return None


def normalize_distill_origin_ref(
    origin_ref: str | None, *, label: str | None = None
) -> dict[str, str | None]:
    if not origin_ref:
        return {}
    return origin_from_external_ref_string(origin_ref, label=label)
