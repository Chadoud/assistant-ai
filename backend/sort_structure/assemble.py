"""Assemble relative folder paths from structured theme values."""

from __future__ import annotations

from constants import UNCERTAIN_FOLDER
from destination_path import MAX_REL_DEST_SEGMENTS, normalize_rel_dest
from sort_structure.compile import ClassifyContract
from sort_structure.normalize import normalize_theme_segment, reuse_existing_case
from sort_structure.subject_tail import sanitize_subject_tail


def assemble_path(
    contract: ClassifyContract,
    theme_values: dict[str, str],
    auto_tail: str | None,
    existing_folders: list[str],
) -> tuple[str, dict[str, str]]:
    """
    Build normalized relative path from theme values.

    Returns (folder_path, normalized_values). Empty/invalid → Uncertain.
    """
    segments: list[str] = []
    normalized: dict[str, str] = {}
    prefix = ""

    for lv in contract.levels:
        if lv.theme == "auto":
            break
        raw = (theme_values.get(lv.key) or "").strip()
        seg = normalize_theme_segment(raw, lv.theme)
        if not seg:
            return UNCERTAIN_FOLDER, normalized
        seg = reuse_existing_case(seg, existing_folders, prefix)
        normalized[lv.key] = seg
        segments.append(seg)
        prefix = "/".join(segments)

    if contract.has_auto_tail and auto_tail:
        subject = sanitize_subject_tail(
            auto_tail,
        ) or normalize_theme_segment(
            auto_tail.replace("\\", "/").split("/")[-1].strip(), "auto"
        )
        if subject:
            if len(segments) >= MAX_REL_DEST_SEGMENTS:
                pass
            else:
                subject = reuse_existing_case(subject, existing_folders, prefix)
                segments.append(subject)
                prefix = "/".join(segments)

    if not segments:
        return UNCERTAIN_FOLDER, normalized
    path = normalize_rel_dest("/".join(segments[:MAX_REL_DEST_SEGMENTS]))
    return path, normalized
