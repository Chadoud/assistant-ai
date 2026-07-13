"""Tests for subject auto_tail sanitization."""

from __future__ import annotations

from sort_structure.subject_tail import sanitize_subject_tail


def test_sanitize_multi_segment_electricity() -> None:
    assert sanitize_subject_tail("/Utility Bills/Electricity") == "Electricity"


def test_sanitize_identity_passports() -> None:
    assert sanitize_subject_tail("Identity/Passports") == "Identity"


def test_sanitize_maps_retail_to_payments() -> None:
    assert sanitize_subject_tail("Retail/Store Receipts") == "Payments"
