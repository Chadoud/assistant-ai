"""Tests for property fingerprint extraction."""

from __future__ import annotations

import pathlib

from sort_structure.assist import apply_theme_assist
from sort_structure.compile import compile_classify_contract
from sort_structure.models import SortStructureModule, SortStructureTemplate
from sort_structure.property_fingerprint import (
    belongs_to_egypt_portfolio_cluster,
    canonical_property_label,
    extract_property_fingerprints,
    is_false_section_building,
    looks_like_ocr_address_property,
)

FIXTURES = pathlib.Path(__file__).resolve().parent / "fixtures" / "structure_corpus"


def test_fingerprint_building_32_hurghada() -> None:
    text = (FIXTURES / "files" / "hilal_utility_hurghada.txt").read_text(encoding="utf-8")
    fp = extract_property_fingerprints(text)
    assert 32 in fp["plot_or_building_ids"]
    assert fp["hurghada"]
    assert fp["hurghada_portfolio"]
    # The page actually states plot/building 32, so that real number is used.
    assert canonical_property_label(fp) == "Plot 32 — Hurghada"


def test_fingerprint_plot_88_from_ocr_misread_qalaa() -> None:
    # "قلعه" (fortress) is a recurring OCR misread of "قطعة" (plot) in this corpus.
    text = "القناة لتوزيع الكهرباء شبكات البحر الاحمر شمال الغردقه قلعه 88 الغردقة"
    fp = extract_property_fingerprints(text)
    assert 88 in fp["plot_ids"]
    assert canonical_property_label(fp) == "Plot 88 — Hurghada"


def test_plot32_filename_overrides_health_directorate_plot7() -> None:
    text = (FIXTURES / "files" / "hilal_utility_hurghada.txt").read_text(encoding="utf-8")
    fp = extract_property_fingerprints(
        text,
        filename_tokens=["egypt", "plot32", "moj", "electricity"],
    )
    assert fp["plot_ids"][0] == 32


def test_plot32_filename_overrides_garbled_health_ocr() -> None:
    text = (FIXTURES / "files" / "hilal_row3_bank_statement.txt").read_text(encoding="utf-8")
    fp = extract_property_fingerprints(
        text,
        filename_tokens=["egypt", "plot32", "electricity"],
    )
    assert fp["plot_ids"][0] == 32


def test_fingerprint_plot_7_kept_as_plot_7() -> None:
    text = "قطعة رقم 7 مديرية الصحة مستشفى الغردقة"
    fp = extract_property_fingerprints(text)
    assert 7 in fp["plot_or_building_ids"]
    # Plot 7 must stay plot 7 — never rewritten to a fabricated Building 32.
    assert canonical_property_label(fp) == "Plot 7 — Hurghada"


def test_fingerprint_portfolio_without_number_uses_neutral_label() -> None:
    text = (
        "تركيب عداد كهرباء شركة القناة لتوزيع الكهرباء الغردقة مديرية الصحة"
    )
    fp = extract_property_fingerprints(text)
    assert fp["hurghada_portfolio"]
    # No readable plot number → neutral utilities grouping, not a false building.
    assert canonical_property_label(fp) == "Hurghada — Red Sea Utilities"


def test_canonical_uses_real_number_not_fabricated_32() -> None:
    text = "Building 7 health directorate hospital Hurghada canal electricity"
    fp = extract_property_fingerprints(text)
    label = canonical_property_label(fp)
    assert label == "Building 7 — Hurghada"
    assert label != "Building 32 — Hospital Street"


def test_assist_row3_bank_statement() -> None:
    text = (
        "قطعة رقم 7 مديرية الصحة مستشفى الغردقة شركة القناة لتوزيع الكهرباء"
    )
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
    theme_values, auto_tail, assist = apply_theme_assist(
        contract,
        {"country": "Egypt", "property": "Building 7"},
        "Electricity",
        text=text,
        document_briefing="Bank statement infrastructure Hurghada hospital",
        doc_kind="bank_statement",
    )
    assert theme_values["property"] == "Plot 7 — Hurghada"
    assert auto_tail == "Electricity"
    assert assist.get("property") == "normalize"


def test_building_7_is_real_when_page_states_plot_7() -> None:
    text = "قطعة رقم 7 مديرية الصحة مستشفى الغردقة شركة القناة لتوزيع الكهرباء"
    fp = extract_property_fingerprints(text)
    # 'Building 7' is NOT a false section number here — the page really says plot 7.
    assert not is_false_section_building("Building 7", fp)
    assert canonical_property_label(fp) == "Plot 7 — Hurghada"


def test_egypt_canal_payment_portfolio() -> None:
    text = "Cash deposit receipt شركة القناة لتوزيع 32 EGP"
    fp = extract_property_fingerprints(text)
    assert belongs_to_egypt_portfolio_cluster(fp)


def test_looks_like_ocr_address() -> None:
    assert looks_like_ocr_address_property("Apartment 0 In Street Of Near Al-gardaqa Hospital")
    assert not looks_like_ocr_address_property("Building 32 — Hospital Street")


def test_assist_normalizes_ocr_property() -> None:
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
    theme_values, auto_tail, assist = apply_theme_assist(
        contract,
        {
            "country": "Egypt",
            "property": "Apartment 0 In Street Of Near Al-gardaqa Hospital",
        },
        None,
        text=text,
        document_briefing="Electricity connection form Hurghada.",
        doc_kind="utility_form",
    )
    assert theme_values["property"] == "Plot 32 — Hurghada"
    assert assist.get("property") == "normalize"
    assert auto_tail == "Electricity"
