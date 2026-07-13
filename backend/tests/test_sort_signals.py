"""Tests for shared sort_signals module."""

from __future__ import annotations

import pathlib

from sort_signals.geo import geo_hits, infer_document_regions
from sort_signals.property import (
    match_hospital_landmark,
    match_hurghada,
    match_moj_electricity_meter,
)
from sort_signals.subject import suggest_subject_from_text
from sort_structure.assist import apply_theme_assist
from sort_structure.compile import compile_classify_contract
from sort_structure.models import SortStructureModule, SortStructureTemplate
from sort_structure.property_fingerprint import (
    canonical_property_label,
    extract_property_fingerprints,
)

FIXTURES = pathlib.Path(__file__).resolve().parent / "fixtures" / "structure_corpus" / "files"


def test_geo_and_property_agree_on_ocr_hurghada_variant() -> None:
    text = (FIXTURES / "hilal_row3_bank_statement.txt").read_text(encoding="utf-8")
    assert "hurghada" in geo_hits(text)
    assert match_hurghada(text)
    assert match_hospital_landmark(text)
    fp = extract_property_fingerprints(text)
    # The page states plot 7 — it must be filed as plot 7, never a fabricated 32.
    assert canonical_property_label(fp) == "Plot 7 — Hurghada"


def test_canal_health_ocr_infers_electricity_subject() -> None:
    text = (FIXTURES / "hilal_row4_canal_health.txt").read_text(encoding="utf-8")
    assert suggest_subject_from_text(text) == "Electricity"


def test_assist_rejects_uae_without_geo_signals() -> None:
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
    theme_values, _, assist = apply_theme_assist(
        contract,
        {"country": "United Arab Emirates", "property": "General Property"},
        "Payments",
        text="[Visual] Document type: Bank statement [OCR] ANS VINEE ANTS",
        document_briefing=None,
        doc_kind="bank_statement",
    )
    assert theme_values.get("country") != "United Arab Emirates"
    assert "country" not in assist or assist.get("country") != "passport"


def test_infer_document_regions_moj_meter_without_city() -> None:
    text = (FIXTURES / "hilal_row12_moj_meter.txt").read_text(encoding="utf-8")
    assert infer_document_regions(text) == {"egypt"}
    assert match_moj_electricity_meter(text)


def test_infer_document_regions_single_egypt_on_hilal_moj() -> None:
    text = (FIXTURES / "hilal_utility_hurghada.txt").read_text(encoding="utf-8")
    assert infer_document_regions(text) == {"egypt"}
