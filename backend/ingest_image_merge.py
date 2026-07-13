"""
Hybrid OCR + vision merge for image filing extraction.
"""

from __future__ import annotations

import re

from constants import EXTRACTION_UNCERTAIN_QUALITY, MAX_CHARS

VISUAL_SECTION_TAG = "[Visual]"
OCR_SECTION_TAG = "[OCR]"
STRUCTURED_SECTION_TAG = "[Structured]"

_VISION_DOC_KEYWORDS = (
    "passport",
    "receipt",
    "invoice",
    "form",
    "statement",
    "certificate",
    "contract",
    "lease",
    "visa",
    "identity",
    "government",
    "bank",
    "payment",
    "notary",
    "approval",
    "deposit",
)


def ocr_is_high_trust_for_filing(text: str) -> bool:
    """Stricter than actionable: OCR alone is strong enough to boost quality."""
    t = (text or "").strip()
    if len(t) < 80:
        return False
    alpha = sum(1 for c in t if c.isalpha())
    if alpha < 40:
        return False
    if alpha / max(len(t), 1) < 0.25:
        return False
    words = re.findall(r"[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]{2,}|[A-Za-zÀ-ÖØ-öø-ÿ]{3,}", t)
    return len(words) >= 12


def _vision_description_quality(vision_text: str) -> float:
    t = (vision_text or "").strip()
    if not t or t.startswith("LOW_SIGNAL_FALLBACK"):
        return 0.0
    base = min(0.55, 0.22 + min(len(t) / 1200.0, 0.25))
    lower = t.lower()
    if any(kw in lower for kw in _VISION_DOC_KEYWORDS):
        base = max(base, float(EXTRACTION_UNCERTAIN_QUALITY))
    if len(t) > 200 and t.count(".") >= 2:
        base = max(base, float(EXTRACTION_UNCERTAIN_QUALITY) + 0.05)
    return min(1.0, base)


def prepend_structured_block(text: str, structured_block: str) -> str:
    """Prepend a [Structured] excerpt block to merged extraction text."""
    block = (structured_block or "").strip()
    if not block:
        return (text or "").strip()
    if block.startswith(STRUCTURED_SECTION_TAG):
        prefix = block
    else:
        prefix = f"{STRUCTURED_SECTION_TAG}\n{block}"
    body = (text or "").strip()
    if not body:
        return prefix[:MAX_CHARS]
    merged = f"{prefix}\n\n{body}"
    return merged[:MAX_CHARS].strip()


def merge_image_extraction_signals(
    ocr_text: str | None,
    vision_text: str | None,
) -> tuple[str, str, dict[str, bool]]:
    """
    Merge OCR and vision into one filing excerpt.

    Returns (merged_text, extraction_source, provenance).
    """
    ocr = (ocr_text or "").strip()
    vision = (vision_text or "").strip()
    provenance = {"ocr": bool(ocr), "vision": bool(vision)}

    if vision and ocr:
        merged = f"{VISUAL_SECTION_TAG}\n{vision[:MAX_CHARS // 2]}\n\n{OCR_SECTION_TAG}\n{ocr[:MAX_CHARS // 2]}"
        return merged[:MAX_CHARS].strip(), "image_hybrid", provenance
    if vision:
        return vision[:MAX_CHARS].strip(), "image_vision", provenance
    if ocr:
        return ocr[:MAX_CHARS].strip(), "image_ocr", provenance
    return "", "image_low_signal", provenance


def estimate_hybrid_image_quality(
    merged_text: str,
    extraction_source: str,
    *,
    ocr_text: str | None = None,
    vision_text: str | None = None,
) -> float:
    """Quality score for hybrid / vision / OCR image sources."""
    src = (extraction_source or "").strip().lower()
    if src == "image_low_signal" or merged_text.startswith("LOW_SIGNAL_FALLBACK"):
        return 0.05

    from ingest_common import estimate_quality

    base = estimate_quality(merged_text)
    ocr_q = estimate_quality(ocr_text or "") if ocr_text else 0.0
    vis_q = _vision_description_quality(vision_text or merged_text if "[Visual]" in merged_text else vision_text or "")

    if src == "image_hybrid":
        score = max(base, ocr_q, vis_q)
        if ocr_is_high_trust_for_filing(ocr_text or ""):
            score = max(score, float(EXTRACTION_UNCERTAIN_QUALITY) + 0.08)
        score = min(1.0, score + 0.06)
        return score
    if src == "image_vision":
        return max(base, vis_q)
    if src == "image_ocr":
        ocr_only = max(base, ocr_q)
        if ocr_is_high_trust_for_filing(ocr_text or merged_text):
            return max(ocr_only, float(EXTRACTION_UNCERTAIN_QUALITY))
        if len(merged_text) > 120 and (merged_text.count("\n") + 1) >= 2:
            return max(ocr_only, min(0.58, 0.30 + min(len(merged_text) / 5000.0, 0.2)))
        return ocr_only
    return base
