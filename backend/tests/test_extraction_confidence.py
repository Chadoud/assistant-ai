"""Tests for unified extraction_confidence scorer."""

from ingest_common import estimate_quality, extraction_confidence
from ingest_image_merge import prepend_structured_block


def test_extraction_confidence_low_signal() -> None:
    assert extraction_confidence("LOW_SIGNAL_FALLBACK kind=image filename=x", "image_low_signal") == 0.05


def test_extraction_confidence_hybrid_boost() -> None:
    text = "[Visual]\nPassport scan Egypt\n\n[OCR]\nnoise"
    score = extraction_confidence(
        text,
        "image_hybrid",
        quality_score=0.35,
        provenance={"ocr": True, "vision": True},
    )
    assert score >= 0.35


def test_extraction_confidence_weak_ocr_only_capped() -> None:
    score = extraction_confidence(
        "abc 123",
        "image_ocr",
        quality_score=0.5,
        provenance={"ocr": True, "vision": False},
    )
    assert score <= 0.42


def test_prepend_structured_block() -> None:
    out = prepend_structured_block("[OCR]\nfoo", "[Structured]\ndoc_kind: passport")
    assert out.startswith("[Structured]")
    assert "[OCR]" in out


def test_extraction_confidence_uses_quality_when_provided() -> None:
    base = estimate_quality("word " * 50)
    score = extraction_confidence("word " * 50, "plain_text", quality_score=base)
    assert score == base
