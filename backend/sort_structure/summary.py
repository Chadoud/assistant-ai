"""Build honest batch summaries for structure templates."""

from __future__ import annotations

from collections import Counter
from typing import Any


def build_structure_summary(job: dict[str, Any]) -> dict[str, Any]:
    """
    Count root-level folders and cap rewrites from completed analyze rows.

    Returns empty dict when no structure template was used.
    """
    cfg = job.get("config") or {}
    if not cfg.get("sort_structure_template"):
        return {}
    files = job.get("files") or []
    roots: Counter[str] = Counter()
    cap_rewrites = 0
    for row in files:
        if not isinstance(row, dict):
            continue
        if row.get("structure_cap_rewritten"):
            cap_rewrites += 1
        folder = str(row.get("final_folder") or row.get("suggested_folder") or "").strip()
        if not folder or folder == "Uncertain":
            continue
        root = folder.split("/")[0]
        roots[root] += 1
    return {
        "root_folder_counts": dict(roots),
        "distinct_roots": len(roots),
        "cap_rewrites": cap_rewrites,
        "total_files": len(files),
    }
