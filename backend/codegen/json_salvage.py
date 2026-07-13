"""Recover complete file entries from truncated LLM JSON responses."""

from __future__ import annotations

import json
import re


def _strip_fences(text: str) -> str:
    raw = text.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
    if fence:
        return fence.group(1).strip()
    return raw


def _object_bounds(blob: str, start: int) -> int | None:
    """Return index after a complete JSON object starting at ``start``, or None."""
    if start >= len(blob) or blob[start] != "{":
        return None
    depth = 0
    in_string = False
    escape = False
    for i in range(start, len(blob)):
        ch = blob[i]
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return i + 1
    return None


def salvage_file_entries(raw: str) -> list[dict[str, str]]:
    """
    Extract every *complete* {path, content} object from a truncated files array.

    @returns list of {path, content} dicts (may be empty).
    """
    blob = _strip_fences(raw)
    anchor = blob.find('"files"')
    if anchor < 0:
        anchor = blob.find("{")
    if anchor < 0:
        return []

    bracket = blob.find("[", anchor)
    if bracket < 0:
        return []

    files: list[dict[str, str]] = []
    i = bracket + 1
    while i < len(blob):
        while i < len(blob) and blob[i] in " \t\r\n,":
            i += 1
        if i >= len(blob) or blob[i] == "]":
            break
        if blob[i] != "{":
            break
        end = _object_bounds(blob, i)
        if end is None:
            break
        chunk = blob[i:end]
        try:
            item = json.loads(chunk)
        except json.JSONDecodeError:
            break
        if isinstance(item, dict):
            path = str(item.get("path", "")).strip()
            content = item.get("content")
            if path and content is not None:
                files.append({"path": path, "content": str(content)})
        i = end
    return files


def salvage_paths_list(raw: str) -> list[str]:
    """Extract path strings from a truncated manifest response."""
    blob = _strip_fences(raw)
    paths: list[str] = []
    for match in re.finditer(r'"path"\s*:\s*"((?:\\.|[^"\\])*)"', blob):
        try:
            paths.append(json.loads(f'"{match.group(1)}"'))
        except json.JSONDecodeError:
            continue
    if paths:
        return paths

    anchor = blob.find('"paths"')
    if anchor < 0:
        return []
    bracket = blob.find("[", anchor)
    if bracket < 0:
        return []
    decoder = json.JSONDecoder()
    i = bracket + 1
    while i < len(blob):
        while i < len(blob) and blob[i] in " \t\r\n,":
            i += 1
        if i >= len(blob) or blob[i] == "]":
            break
        try:
            value, end = decoder.raw_decode(blob, i)
        except json.JSONDecodeError:
            break
        if isinstance(value, str) and value.strip():
            paths.append(value.strip())
        i = end
    return paths
