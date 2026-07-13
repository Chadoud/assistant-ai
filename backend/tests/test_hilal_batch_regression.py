"""Hilal batch regression cases from structure_corpus/hilal_batch_cases.json."""

from __future__ import annotations

import json
import pathlib

from sort_structure.assist import apply_theme_assist
from sort_structure.compile import compile_classify_contract
from sort_structure.models import SortStructureModule, SortStructureTemplate
from sort_structure.property_fingerprint import (
    canonical_property_label,
    extract_property_fingerprints,
)

ROOT = pathlib.Path(__file__).resolve().parent / "fixtures" / "structure_corpus"
CASES = json.loads((ROOT / "hilal_batch_cases.json").read_text(encoding="utf-8"))["cases"]


def _three_level_contract():
    return compile_classify_contract(
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


def test_hilal_batch_cases() -> None:
    contract = _three_level_contract()
    for case in CASES:
        case_id = case["id"]
        if case.get("file"):
            text = (ROOT / "files" / case["file"]).read_text(encoding="utf-8")
        else:
            text = case.get("text") or ""

        theme_in = {}
        if case.get("llm_country"):
            theme_in["country"] = case["llm_country"]
        if case.get("llm_property"):
            theme_in["property"] = case["llm_property"]

        theme_values, auto_tail, _assist = apply_theme_assist(
            contract,
            theme_in,
            None,
            text=text,
            document_briefing=case.get("briefing"),
            doc_kind=None,
        )

        if "expected_country" in case:
            expected = case["expected_country"]
            if expected is None:
                assert theme_values.get("country") != "United Arab Emirates", case_id
            else:
                assert theme_values.get("country") == expected, case_id

        if case.get("expected_property"):
            if case["expected_property"]:
                fp = extract_property_fingerprints(text, case.get("briefing"))
                assert canonical_property_label(fp) == case["expected_property"], case_id
                theme_values, auto_tail, _ = apply_theme_assist(
                    contract,
                    theme_in,
                    auto_tail,
                    text=text,
                    document_briefing=case.get("briefing"),
                )
                assert theme_values.get("property") == case["expected_property"], case_id

        if case.get("expected_subject"):
            assert auto_tail == case["expected_subject"], case_id
