"""Normalize folder segment names per theme."""

from __future__ import annotations

import re

from destination_path import sanitize_folder_segment
from sort_structure.models import SortThemeId
from sort_structure.themes import COUNTRY_ALIASES


def normalize_theme_segment(raw: str, theme: SortThemeId) -> str:
    """Return a sanitized folder segment for one theme level."""
    text = (raw or "").strip()
    if not text:
        return ""
    if theme == "year":
        match = re.search(r"\b(19|20)\d{2}\b", text)
        return match.group(0) if match else sanitize_folder_segment(text)
    if theme == "country":
        key = text.lower().strip()
        if key in COUNTRY_ALIASES:
            return COUNTRY_ALIASES[key]
        return _title_case(sanitize_folder_segment(text))
    return _title_case(sanitize_folder_segment(text))


def _title_case(name: str) -> str:
    if not name:
        return ""
    return " ".join(w[:1].upper() + w[1:].lower() if w else "" for w in name.split())


def reuse_existing_case(
    segment: str,
    existing_folders: list[str],
    parent_prefix: str,
) -> str:
    """Match segment case-insensitively against existing paths at this level."""
    if not segment:
        return segment
    parent = (parent_prefix or "").strip().strip("/")
    target_suffix = segment.lower()
    for folder in existing_folders:
        parts = folder.split("/")
        if parent:
            if not folder.lower().startswith(parent.lower() + "/") and folder.lower() != parent.lower():
                continue
            rel = folder[len(parent) + 1 :] if folder.lower().startswith(parent.lower() + "/") else ""
        else:
            rel = parts[0] if parts else ""
        if not rel:
            continue
        leaf = rel.split("/")[0]
        if leaf.lower() == target_suffix:
            return leaf
    return segment
