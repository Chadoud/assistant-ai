"""Gold corpus path-shape regression for structure templates."""

from __future__ import annotations

import json
import pathlib

from sort_structure.assemble import assemble_path
from sort_structure.compile import compile_classify_contract
from sort_structure.models import SortStructureModule, SortStructureTemplate

FIXTURES = pathlib.Path(__file__).resolve().parent / "fixtures" / "structure_corpus"


def _country_property_template() -> SortStructureTemplate:
    return SortStructureTemplate(
        enabled=True,
        modules=[
            SortStructureModule(
                id="c",
                theme="country",
                children=[
                    SortStructureModule(id="p", theme="property", children=[]),
                ],
            )
        ],
    )


def test_gold_corpus_path_shape_meets_threshold() -> None:
    meta = json.loads((FIXTURES / "metadata.json").read_text(encoding="utf-8"))
    contract = compile_classify_contract(_country_property_template(), language="English")
    cases = meta.get("cases") or []
    assert cases, "corpus must define cases"

    matched = 0
    for case in cases:
        if case.get("assist"):
            continue
        theme_values = case.get("theme_values") or {}
        expected = str(case.get("expected_prefix") or "").strip()
        path, _ = assemble_path(contract, theme_values, None, [])
        if expected.endswith("/"):
            ok = path.startswith(expected.rstrip("/"))
        else:
            ok = path == expected or path.startswith(f"{expected}/")
        if ok:
            matched += 1

    property_cases = [c for c in cases if not c.get("assist")]
    rate = matched / len(property_cases)
    assert rate >= 0.85, f"corpus match {matched}/{len(property_cases)} = {rate:.0%}"


def test_hilal_utility_assist_corpus_path() -> None:
    from sort_structure.assemble_classify import finalize_structure_classify

    meta = json.loads((FIXTURES / "metadata.json").read_text(encoding="utf-8"))
    case = next(c for c in meta["cases"] if c.get("file") == "hilal_utility_hurghada.txt")
    contract = compile_classify_contract(
        SortStructureTemplate(
            enabled=True,
            modules=[
                SortStructureModule(
                    id="c",
                    theme="country",
                    children=[SortStructureModule(id="a", theme="auto", children=[])],
                )
            ],
        ),
        language="English",
    )
    text = (FIXTURES / "files" / case["file"]).read_text(encoding="utf-8")
    raw = '{"theme_values":{},"auto_tail":"","confidence":0.95,"reason":"x","primary_purpose":"y"}'
    out = finalize_structure_classify(
        contract,
        raw,
        existing_folders=[],
        text=text,
        document_briefing=case.get("briefing"),
    )
    assert out["structure_values"].get("country") == "Egypt"
    assert out["folder_name"].startswith("Egypt/Electricity")
    assert out["structure_assist"].get("country") == "geo"
    assert out["structure_assist"].get("auto_tail") == "briefing"


def test_hilal_three_level_finalize_path() -> None:
    from sort_structure.assemble_classify import finalize_structure_classify

    contract = compile_classify_contract(
        SortStructureTemplate(
            enabled=True,
            modules=[
                SortStructureModule(
                    id="c",
                    theme="country",
                    children=[
                        SortStructureModule(
                            id="p",
                            theme="property",
                            children=[SortStructureModule(id="a", theme="auto", children=[])],
                        )
                    ],
                )
            ],
        ),
        language="English",
    )
    text = (FIXTURES / "files" / "hilal_utility_hurghada.txt").read_text(encoding="utf-8")
    raw = (
        '{"theme_values":{"country":"Egypt","property":"Apartment On Street"},'
        '"auto_tail":"","confidence":0.9,"reason":"x","primary_purpose":"y"}'
    )
    out = finalize_structure_classify(
        contract,
        raw,
        existing_folders=[],
        text=text,
        document_briefing="Electricity utility connection Hurghada plot 32.",
    )
    assert out["folder_name"] == "Egypt/Plot 32 — Hurghada/Electricity"
    assert out["structure_assist"].get("property") == "normalize"


def test_finalize_handles_null_auto_tail_json() -> None:
    from sort_structure.assemble_classify import finalize_structure_classify

    contract = compile_classify_contract(
        SortStructureTemplate(
            enabled=True,
            modules=[
                SortStructureModule(
                    id="c",
                    theme="country",
                    children=[SortStructureModule(id="a", theme="auto", children=[])],
                )
            ],
        ),
        language="English",
    )
    text = (FIXTURES / "files" / "hilal_utility_hurghada.txt").read_text(encoding="utf-8")
    raw = '{"theme_values":{},"auto_tail":null,"confidence":0.9,"reason":"x","primary_purpose":"y"}'
    out = finalize_structure_classify(
        contract,
        raw,
        existing_folders=[],
        text=text,
        document_briefing=None,
    )
    assert out["structure_values"].get("country") == "Egypt"
    assert out["folder_name"].startswith("Egypt/")
    assert out["auto_tail"] in (None, "Electricity")
