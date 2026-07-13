"""Batch cap enforcement for sort structure templates."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from constants import UNCERTAIN_FOLDER
from destination_path import normalize_rel_dest
from sort_structure.compile import ThemeLevel, compile_classify_contract
from sort_structure.models import SortStructureTemplate
from sort_structure.themes import other_folder_label


def finalize_structure_caps(job: dict[str, Any]) -> None:
    """
    Rewrite file folder paths when themed levels exceed max_folders.

    Runs after all rows are classified; skips Uncertain and error rows.
    """
    cfg = job.get("config") or {}
    raw = cfg.get("sort_structure_template")
    if not raw:
        return
    try:
        tpl = (
            raw
            if isinstance(raw, SortStructureTemplate)
            else SortStructureTemplate.model_validate(raw)
        )
    except Exception:
        return
    if not tpl.enabled or not tpl.modules:
        return
    language = str(cfg.get("language") or "English")
    contract = compile_classify_contract(tpl, language=language)
    if not contract.levels:
        return

    for level_index, level in enumerate(contract.levels):
        if level.max_folders is None or level.theme == "auto":
            continue
        _apply_cap_at_level(job, contract.levels, level_index, level)


def _apply_cap_at_level(
    job: dict[str, Any],
    levels: tuple[ThemeLevel, ...],
    level_index: int,
    level: ThemeLevel,
) -> None:
    max_n = int(level.max_folders or 0)
    if max_n < 1:
        return

    groups: dict[str, list[dict]] = defaultdict(list)
    for row in job.get("files") or []:
        if not isinstance(row, dict):
            continue
        if row.get("status") == "error":
            continue
        folder = str(row.get("final_folder") or row.get("suggested_folder") or "").strip()
        if not folder or folder == UNCERTAIN_FOLDER:
            continue
        parts = folder.split("/")
        if level_index >= len(parts):
            continue
        parent = "/".join(parts[:level_index]) if level_index > 0 else ""
        groups[parent].append(row)

    for _parent, rows in groups.items():
        segment_counts: dict[str, list[dict]] = defaultdict(list)
        for row in rows:
            folder = str(row.get("final_folder") or row.get("suggested_folder") or "")
            parts = folder.split("/")
            if level_index >= len(parts):
                continue
            seg = parts[level_index]
            segment_counts[seg.lower()].append(row)

        if len(segment_counts) <= max_n:
            continue

        ranked = sorted(
            segment_counts.items(),
            key=lambda item: (-len(item[1]), item[0]),
        )
        keep_count = max_n - 1
        keep_keys = {k for k, _ in ranked[:keep_count]}
        other_label = other_folder_label(level.theme, level.custom_label)
        other_norm = normalize_rel_dest(other_label)

        for seg_key, seg_rows in segment_counts.items():
            if seg_key in keep_keys:
                continue
            for row in seg_rows:
                _remap_row_segment(row, level_index, other_norm, level, seg_key)


def _remap_row_segment(
    row: dict[str, Any],
    level_index: int,
    new_segment: str,
    level: ThemeLevel,
    old_seg_key: str,
) -> None:
    folder = str(row.get("final_folder") or row.get("suggested_folder") or "")
    parts = folder.split("/")
    if level_index >= len(parts):
        return

    if level.overflow_policy == "send_to_uncertain":
        row["final_folder"] = UNCERTAIN_FOLDER
        row["suggested_folder"] = UNCERTAIN_FOLDER
        row["structure_cap_rewritten"] = True
        row["reason"] = f"Capped {level.theme}; sent to review"
        return

    parts[level_index] = new_segment
    new_path = normalize_rel_dest("/".join(parts))
    row["final_folder"] = new_path
    row["suggested_folder"] = new_path
    row["structure_cap_rewritten"] = True
    prev = row.get("reason") or ""
    row["reason"] = f"{prev}; grouped into {new_segment}".strip("; ")

    trace = row.get("decision_trace")
    if not isinstance(trace, dict):
        trace = {}
    trace["cap_remapped_from"] = old_seg_key
    trace["cap_overflow_policy"] = level.overflow_policy
    row["decision_trace"] = trace
