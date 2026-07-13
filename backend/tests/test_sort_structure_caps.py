"""Tests for batch cap enforcement."""

from __future__ import annotations

from sort_structure.caps import finalize_structure_caps
from sort_structure.models import SortStructureModule, SortStructureTemplate


def test_cap_groups_overflow_countries() -> None:
    tpl = SortStructureTemplate(
        enabled=True,
        modules=[
            SortStructureModule(
                id="c",
                theme="country",
                max_folders=3,
                children=[],
            )
        ],
    )
    job = {
        "config": {"sort_structure_template": tpl.model_dump(), "language": "English"},
        "files": [],
    }
    countries = ["France", "Germany", "Spain", "Italy", "Belgium"]
    for i, country in enumerate(countries):
        job["files"].append(
            {
                "status": "review_ready",
                "suggested_folder": country,
                "final_folder": country,
            }
        )
    # add extra files to bias ranking
    job["files"].append(
        {
            "status": "review_ready",
            "suggested_folder": "France",
            "final_folder": "France",
        }
    )

    finalize_structure_caps(job)

    roots = {str(r.get("final_folder", "")).split("/")[0] for r in job["files"]}
    assert len(roots) <= 3
    assert any("Other" in r for r in roots)


def test_cap_nested_property_unchanged_when_under_limit() -> None:
    tpl = SortStructureTemplate(
        enabled=True,
        modules=[
            SortStructureModule(
                id="c",
                theme="country",
                max_folders=None,
                children=[
                    SortStructureModule(id="p", theme="property", max_folders=None, children=[]),
                ],
            )
        ],
    )
    job = {
        "config": {"sort_structure_template": tpl.model_dump(), "language": "English"},
        "files": [
            {"status": "review_ready", "suggested_folder": "France/Villa", "final_folder": "France/Villa"},
            {"status": "review_ready", "suggested_folder": "France/Chalet", "final_folder": "France/Chalet"},
        ],
    }
    finalize_structure_caps(job)
    paths = {f["final_folder"] for f in job["files"]}
    assert paths == {"France/Villa", "France/Chalet"}
