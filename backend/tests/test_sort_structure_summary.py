"""Tests for structure summary builder."""

from __future__ import annotations

from sort_structure.summary import build_structure_summary


def test_build_structure_summary_empty_without_template() -> None:
    assert build_structure_summary({"config": {}, "files": []}) == {}


def test_build_structure_summary_counts_roots() -> None:
    job = {
        "config": {"sort_structure_template": {"enabled": True, "modules": []}},
        "files": [
            {"final_folder": "France/Villa", "structure_cap_rewritten": False},
            {"final_folder": "Germany/House", "structure_cap_rewritten": True},
        ],
    }
    out = build_structure_summary(job)
    assert out["distinct_roots"] == 2
    assert out["cap_rewrites"] == 1
    assert out["root_folder_counts"]["France"] == 1
