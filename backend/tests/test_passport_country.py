"""Tests for passport issuer country inference."""

from __future__ import annotations

from sort_structure.passport_country import infer_passport_country_label


def test_swiss_passport_from_mrz_and_labels() -> None:
    text = (
        "[Visual] Document type: Passport [OCR] Schweiz Suisse Svizzera "
        "X1710855<6CHE6405102M250616"
    )
    assert infer_passport_country_label(text, doc_kind="passport_scan") == "Switzerland"


def test_french_passport_from_text() -> None:
    text = "[Visual] Document type: Passport [OCR] DFAE Berne ORNEX France"
    assert infer_passport_country_label(text, doc_kind="passport_scan") == "France"


def test_weak_ocr_passport_has_no_country() -> None:
    # OCR noise ("vast ae GNO...") must NOT be treated as a UAE issuer cue;
    # an unreadable passport has no corroborated country and goes to review.
    text = "[Visual] Document type: Passport [OCR] vast ae GNO186104"
    assert infer_passport_country_label(text) is None


def test_uae_passport_from_mrz_prefix() -> None:
    text = "[Visual] Document type: Passport [OCR] P<AREALHASHIMI<<AHMED"
    assert infer_passport_country_label(text, doc_kind="passport_scan") == (
        "United Arab Emirates"
    )


def test_ignores_non_passport_docs() -> None:
    text = "Bank statement from Switzerland account"
    assert infer_passport_country_label(text, doc_kind="bank_statement") is None
