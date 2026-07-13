"""Tests for structure theme assist (geo + briefing)."""

from __future__ import annotations

import pathlib

from sort_structure.assist import (
    apply_theme_assist,
    infer_country_label_from_text,
    suggest_auto_tail_from_briefing,
)
from sort_structure.compile import compile_classify_contract
from sort_structure.models import SortStructureModule, SortStructureTemplate

FIXTURES = pathlib.Path(__file__).resolve().parent / "fixtures" / "structure_corpus"


def _country_auto_template():
    return SortStructureTemplate(
        enabled=True,
        modules=[
            SortStructureModule(
                id="c",
                theme="country",
                children=[SortStructureModule(id="a", theme="auto", children=[])],
            )
        ],
    )


def test_infer_country_from_hurghada_cues() -> None:
    text = (FIXTURES / "files" / "hilal_utility_hurghada.txt").read_text(encoding="utf-8")
    assert infer_country_label_from_text(text) == "Egypt"


def test_apply_theme_assist_fills_country_and_auto_tail() -> None:
    text = (FIXTURES / "files" / "hilal_utility_hurghada.txt").read_text(encoding="utf-8")
    contract = compile_classify_contract(_country_auto_template(), language="English")
    briefing = (
        "Arabic utility connection form from Ministry of Justice for electrical wiring in Hurghada."
    )
    theme_values, auto_tail, assist = apply_theme_assist(
        contract,
        {},
        None,
        text=text,
        document_briefing=briefing,
    )
    assert theme_values.get("country") == "Egypt"
    assert assist.get("country") == "geo"
    assert auto_tail == "Electricity"
    assert assist.get("auto_tail") == "briefing"


def test_apply_theme_assist_geo_overrides_wrong_llm_country() -> None:
    text = (FIXTURES / "files" / "hilal_utility_hurghada.txt").read_text(encoding="utf-8")
    contract = compile_classify_contract(_country_auto_template(), language="English")
    theme_values, _, assist = apply_theme_assist(
        contract,
        {"country": "France"},
        None,
        text=text,
        document_briefing=None,
    )
    assert theme_values["country"] == "Egypt"
    assert assist.get("country") == "geo_override"


def test_assist_geo_overrides_llm_uae_on_hurghada_moj_form() -> None:
    text = (FIXTURES / "files" / "hilal_utility_hurghada.txt").read_text(encoding="utf-8")
    contract = _country_property_auto_contract()
    theme_values, auto_tail, assist = apply_theme_assist(
        contract,
        {
            "country": "United Arab Emirates",
            "property": "Building 32 — Hospital Street",
        },
        "Electricity",
        text=text,
        document_briefing="Ministry of Justice electricity form Hurghada",
        doc_kind="utility_form",
    )
    assert theme_values["country"] == "Egypt"
    assert assist.get("country") == "geo_override"
    assert theme_values["property"] == "Plot 32 — Hurghada"
    assert auto_tail == "Electricity"


def test_assist_rejects_arabic_speaking_regions() -> None:
    text = "Cash deposit receipt شركة القناة EGP payment"
    contract = _country_property_auto_contract()
    theme_values, auto_tail, assist = apply_theme_assist(
        contract,
        {"country": "Arabic-speaking Regions", "property": "General Property"},
        "Payments",
        text=text,
        document_briefing="Canal company payment receipt",
        doc_kind="receipt",
    )
    assert theme_values["country"] == "Egypt"
    assert assist.get("country") in {"geo", "geo_override"}
    assert auto_tail == "Payments"


def test_assist_passport_overrides_egypt_on_saudi_passport() -> None:
    text = "[Visual] Document type: Passport [OCR] المملكة العربية السعودية SAU1234567"
    contract = _country_property_auto_contract()
    theme_values, auto_tail, assist = apply_theme_assist(
        contract,
        {"country": "Egypt", "property": "Identity Documents"},
        "Identity",
        text=text,
        document_briefing=None,
        doc_kind="passport_scan",
    )
    assert theme_values["country"] == "Saudi Arabia"
    assert assist.get("country") == "passport_override"
    assert auto_tail == "Identity"


def test_suggest_auto_tail_from_briefing_only() -> None:
    tail = suggest_auto_tail_from_briefing(
        "Utility connection form for electrical wiring installation.",
    )
    assert tail == "Electricity"


def _country_property_auto_contract():
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


def test_assist_passport_country_and_identity_path() -> None:
    text = "[Visual] Document type: Passport [OCR] Schweiz Suisse CHE6405102"
    contract = _country_property_auto_contract()
    theme_values, auto_tail, assist = apply_theme_assist(
        contract,
        {},
        None,
        text=text,
        document_briefing=None,
        doc_kind="passport_scan",
    )
    assert theme_values["country"] == "Switzerland"
    assert theme_values["property"] == "Identity Documents"
    assert auto_tail == "Identity"
    assert assist.get("country") == "passport"


def test_assist_normalizes_plot_7_to_real_plot() -> None:
    text = (
        "قطعة رقم 7 مديرية الصحة مستشفى الغردقة شركة القناة لتوزيع الكهرباء"
    )
    contract = _country_property_auto_contract()
    theme_values, auto_tail, assist = apply_theme_assist(
        contract,
        {"country": "Egypt", "property": "Building 7"},
        "Electricity",
        text=text,
        document_briefing="Bank statement infrastructure Hurghada hospital",
        doc_kind="bank_statement",
    )
    # The page states plot 7 — normalize to the real plot, never a fabricated 32.
    assert theme_values["property"] == "Plot 7 — Hurghada"
    assert assist.get("property") == "normalize"
    assert auto_tail == "Electricity"


def test_assist_moj_meter_row12_without_hurghada_in_ocr() -> None:
    text = (FIXTURES / "files" / "hilal_row12_moj_meter.txt").read_text(encoding="utf-8")
    contract = _country_property_auto_contract()
    theme_values, auto_tail, assist = apply_theme_assist(
        contract,
        {"country": "Egypt", "property": "Apartment 11 Street Of The Sea"},
        "Electricity",
        text=text,
        document_briefing="MoJ meter installation form apartment 11",
        doc_kind="utility_form",
        document_language="Arabic",
    )
    assert theme_values["country"] == "Egypt"
    assert theme_values["property"] == "Hurghada — Red Sea Utilities"
    assert auto_tail == "Electricity"
    assert assist.get("property") == "normalize"


def test_assist_drops_uncorroborated_country_from_weak_passport() -> None:
    # OCR noise only ("vast ae GNO..."): no readable issuer, no geo. We must not
    # invent a country — the row goes to review instead of a confident wrong home.
    text = "[Visual] Document type: Passport [OCR] vast ae GNO186104"
    contract = _country_property_auto_contract()
    theme_values, auto_tail, assist = apply_theme_assist(
        contract,
        {"country": "United Arab Emirates"},
        None,
        text=text,
        document_briefing=None,
        doc_kind=None,
    )
    assert theme_values.get("country") in (None, "")
    assert assist.get("country") == "uncorroborated"


def test_assist_drops_country_asserted_only_by_briefing() -> None:
    # The briefing GUESSES Saudi Arabia ("the text suggests...") with no OCR
    # evidence and Arabic language (spoken across many countries). The model's
    # own narrative must not validate a country — row goes to review.
    text = "[Visual] Document type: Passport [OCR] 89 ا الي ves حاصل على البطاقة"
    contract = _country_property_auto_contract()
    theme_values, _, assist = apply_theme_assist(
        contract,
        {"country": "Saudi Arabia"},
        None,
        text=text,
        document_briefing="The Arabic text suggests the document was issued in Saudi Arabia.",
        doc_kind="passport_scan",
        document_language="Arabic",
    )
    assert theme_values.get("country") in (None, "")
    assert assist.get("country") == "uncorroborated"


def test_assist_keeps_country_corroborated_by_document_language() -> None:
    # French-language passport OCR with no literal "France" but a French locale.
    # The OCR-derived language corroborates a French-speaking country.
    text = (
        "[Visual] Document type: Passport [OCR] particulier exposer à une humidité "
        "excessive à des températures Couleur des yeux MARRON ORNEX"
    )
    contract = _country_property_auto_contract()
    theme_values, _, assist = apply_theme_assist(
        contract,
        {"country": "France"},
        None,
        text=text,
        document_briefing=None,
        doc_kind="passport_scan",
        document_language="French",
    )
    assert theme_values.get("country") == "France"
    assert assist.get("country") in (None, "language", "passport")


def test_assist_structured_vision_fills_country() -> None:
    contract = _country_property_auto_contract()
    theme_values, _, assist = apply_theme_assist(
        contract,
        {},
        "Identity",
        text="[OCR] unreadable national id scan",
        document_briefing=None,
        structured_vision={
            "doc_kind": "national_id_card",
            "issuer_country": "Egypt",
            "confidence": 0.82,
        },
    )
    assert theme_values.get("country") == "Egypt"
    assert assist.get("country") == "structured_vision"


def test_assist_filename_country_hint_when_degraded() -> None:
    contract = _country_property_auto_contract()
    theme_values, _, assist = apply_theme_assist(
        contract,
        {},
        "Identity",
        text="[OCR] blurry scan with no geography",
        document_briefing=None,
        filename_tokens=["egypt", "national", "id"],
        extraction_confidence=0.2,
    )
    assert theme_values.get("country") == "Egypt"
    assert assist.get("country") == "filename_hint"


def test_assist_structure_sort_filename_country_when_extraction_scores_mixed() -> None:
    contract = _country_property_auto_contract()
    theme_values, _, assist = apply_theme_assist(
        contract,
        {},
        "Ownership",
        text="[OCR] formal letter Cairo power of attorney weak scan",
        document_briefing="Power of attorney for apartment sale in Hurghada",
        filename_tokens=["15", "egypt", "power", "of", "attorney"],
        extraction_confidence=0.55,
        extraction_quality=0.42,
        structure_sort=True,
    )
    assert theme_values.get("country") == "Egypt"
    assert assist.get("country") == "filename_hint"
