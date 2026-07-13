"""Deterministic helpers for structure theme extraction and normalization."""

from __future__ import annotations

from typing import Any

from constants import STRUCTURED_VISION_MIN_CONFIDENCE, STRUCTURED_VISION_TRIGGER
from sort_signals.geo import (
    country_from_filename_tokens,
    country_label_supported_by_text,
    country_supported_by_language,
    geo_hits,
    infer_document_regions,
)
from sort_signals.subject import suggest_subject_from_text
from sort_structure.compile import ClassifyContract
from sort_structure.passport_country import infer_passport_country_label
from sort_structure.property_fingerprint import (
    HURGHADA_UTILITIES_LABEL,
    PROPERTY_FALLBACK_GENERAL,
    PROPERTY_FALLBACK_IDENTITY,
    belongs_to_egypt_portfolio_cluster,
    canonical_property_label,
    extract_property_fingerprints,
    is_false_section_building,
    looks_like_ocr_address_property,
)
from sort_structure.subject_tail import sanitize_subject_tail
from sort_structure.themes import is_valid_country_theme_label

_REGION_COUNTRY_LABEL: dict[str, str] = {
    "egypt": "Egypt",
    "uae": "United Arab Emirates",
    "france": "France",
    "switzerland": "Switzerland",
    "germany": "Germany",
    "jordan": "Jordan",
    "saudi_arabia": "Saudi Arabia",
}

# Legacy hardcoded label from an earlier remediation pass. It must never survive
# when the page does not explicitly state building/plot 32.
_LEGACY_FABRICATED_BUILDING_LABEL = "Building 32 — Hospital Street"


def _vision_country_label(structured_vision: dict[str, Any] | None) -> str | None:
    if not isinstance(structured_vision, dict):
        return None
    conf = structured_vision.get("confidence")
    try:
        conf_f = float(conf)
    except (TypeError, ValueError):
        return None
    if conf_f < float(STRUCTURED_VISION_MIN_CONFIDENCE):
        return None
    label = structured_vision.get("issuer_country")
    if not isinstance(label, str) or not label.strip():
        return None
    label = label.strip()
    return label if is_valid_country_theme_label(label) else None


def _effective_doc_kind(
    doc_kind: str | None,
    structured_vision: dict[str, Any] | None,
) -> str | None:
    vision_kind = None
    if isinstance(structured_vision, dict):
        vk = structured_vision.get("doc_kind")
        if isinstance(vk, str) and vk.strip():
            vision_kind = vk.strip()
    if vision_kind and vision_kind.lower() in {"national_id_card", "national_id", "id_card"}:
        return vision_kind
    return doc_kind


def infer_country_label_from_text(text: str) -> str | None:
    """Map strong geography cues in document text to a country folder segment."""
    regions = infer_document_regions(text)
    if len(regions) != 1:
        return None
    return _REGION_COUNTRY_LABEL.get(next(iter(regions)))


def suggest_subject_from_briefing(
    document_briefing: str | None,
    *,
    doc_kind: str | None = None,
    text: str | None = None,
) -> str | None:
    """Suggest a subject auto_tail segment from briefing, doc_kind, and text."""
    return suggest_subject_from_text(
        text,
        document_briefing=document_briefing,
        doc_kind=doc_kind,
    )


def suggest_auto_tail_from_briefing(
    document_briefing: str | None,
    *,
    doc_kind: str | None = None,
    text: str | None = None,
) -> str | None:
    """Alias for subject suggestion (backward compatible name)."""
    return suggest_subject_from_briefing(document_briefing, doc_kind=doc_kind, text=text)


def _property_level_key(contract: ClassifyContract) -> str | None:
    for lv in contract.levels:
        if lv.theme == "property":
            return lv.key
        if lv.theme == "auto":
            break
    return None


def _country_level_key(contract: ClassifyContract) -> str | None:
    for lv in contract.levels:
        if lv.theme == "country":
            return lv.key
        if lv.theme == "auto":
            break
    return None


def _degraded_extraction_for_filename_hint(
    extraction_confidence: float | None,
    extraction_quality: float | None,
) -> bool:
    scores: list[float] = []
    for raw in (extraction_confidence, extraction_quality):
        if raw is None:
            continue
        try:
            scores.append(float(raw))
        except (TypeError, ValueError):
            continue
    if not scores:
        return False
    return min(scores) < float(STRUCTURED_VISION_TRIGGER)


def _try_filename_country_hint(
    country_key: str,
    filled: dict[str, str],
    assist: dict[str, str],
    filename_tokens: list[str] | None,
) -> bool:
    filename_country = country_from_filename_tokens(filename_tokens)
    if not filename_country or not is_valid_country_theme_label(filename_country):
        return False
    filled[country_key] = filename_country
    assist[country_key] = "filename_hint"
    return True


def _apply_country_assist(
    contract: ClassifyContract,
    filled: dict[str, str],
    assist: dict[str, str],
    *,
    text: str,
    document_briefing: str | None,
    doc_kind: str | None,
    document_language: str | None,
    structured_vision: dict[str, Any] | None = None,
    filename_tokens: list[str] | None = None,
    extraction_confidence: float | None = None,
    extraction_quality: float | None = None,
    structure_sort: bool = False,
    reconcile_country_hint: str | None = None,
) -> None:
    """Override invalid or contradicted LLM country labels using passport/geo cues."""
    country_key = _country_level_key(contract)
    if not country_key:
        return

    effective_doc_kind = _effective_doc_kind(doc_kind, structured_vision)

    current = (filled.get(country_key) or "").strip()
    cleared_unsupported_country = False
    if current and not is_valid_country_theme_label(current):
        filled.pop(country_key, None)
        current = ""
        cleared_unsupported_country = True

    if current == "United Arab Emirates" and "uae" not in set(geo_hits(text)):
        filled.pop(country_key, None)
        current = ""
        cleared_unsupported_country = True

    vision_country = _vision_country_label(structured_vision)
    if vision_country:
        if not current or current != vision_country:
            filled[country_key] = vision_country
            assist[country_key] = "structured_vision" if not current else "structured_vision_override"
        return

    passport_country = infer_passport_country_label(
        text, document_briefing, doc_kind=effective_doc_kind
    )
    if passport_country:
        if not current or current != passport_country:
            filled[country_key] = passport_country
            assist[country_key] = "passport_override" if current else "passport"
        return

    geo_country = infer_country_label_from_text(text)
    if geo_country and current and current != geo_country:
        filled[country_key] = geo_country
        assist[country_key] = "geo_override"
        return

    if current:
        if country_label_supported_by_text(current, text):
            return
        if country_supported_by_language(current, document_language):
            assist[country_key] = assist.get(country_key) or "language"
            return
        filled.pop(country_key, None)
        assist[country_key] = "uncorroborated"
        current = ""

    if geo_country and not current:
        filled[country_key] = geo_country
        assist[country_key] = "geo_override" if cleared_unsupported_country else "geo"
        return

    if reconcile_country_hint and is_valid_country_theme_label(reconcile_country_hint):
        filled[country_key] = reconcile_country_hint
        assist[country_key] = "reconcile"
        return

    degraded = _degraded_extraction_for_filename_hint(
        extraction_confidence, extraction_quality
    )
    if degraded or structure_sort:
        if _try_filename_country_hint(country_key, filled, assist, filename_tokens):
            return

    if cleared_unsupported_country and not (filled.get(country_key) or "").strip():
        assist[country_key] = "uncorroborated"


def _apply_property_fallback(
    contract: ClassifyContract,
    filled: dict[str, str],
    assist: dict[str, str],
    *,
    text: str,
    document_briefing: str | None,
    subject_tail: str | None,
    filename_tokens: list[str] | None = None,
) -> None:
    """Fill missing property using fingerprint or subject-aware fallbacks."""
    prop_key = _property_level_key(contract)
    country_key = _country_level_key(contract)
    if not prop_key or (filled.get(prop_key) or "").strip():
        return
    if country_key and not (filled.get(country_key) or "").strip():
        return
    fingerprints = extract_property_fingerprints(
        text, document_briefing, filename_tokens=filename_tokens
    )
    canonical = canonical_property_label(fingerprints)
    if canonical:
        filled[prop_key] = canonical
        assist[prop_key] = "fingerprint"
        return
    if subject_tail == "Identity":
        filled[prop_key] = PROPERTY_FALLBACK_IDENTITY
        assist[prop_key] = "subject_fallback"
        return
    if subject_tail:
        filled[prop_key] = PROPERTY_FALLBACK_GENERAL
        assist[prop_key] = "default"


def _apply_property_assist(
    contract: ClassifyContract,
    filled: dict[str, str],
    assist: dict[str, str],
    *,
    text: str,
    document_briefing: str | None,
    filename_tokens: list[str] | None = None,
) -> None:
    prop_key = _property_level_key(contract)
    if not prop_key:
        return
    fingerprints = extract_property_fingerprints(
        text, document_briefing, filename_tokens=filename_tokens
    )
    canonical = canonical_property_label(fingerprints)
    current = (filled.get(prop_key) or "").strip()
    if not current:
        if canonical:
            filled[prop_key] = canonical
            assist[prop_key] = "fingerprint"
        return
    if not _should_normalize_property(current, canonical, fingerprints):
        return
    replacement = canonical
    if not replacement:
        if current == _LEGACY_FABRICATED_BUILDING_LABEL:
            replacement = (
                HURGHADA_UTILITIES_LABEL
                if belongs_to_egypt_portfolio_cluster(fingerprints)
                else PROPERTY_FALLBACK_GENERAL
            )
        elif looks_like_ocr_address_property(current):
            replacement = PROPERTY_FALLBACK_GENERAL
        else:
            return
    filled[prop_key] = replacement
    assist[prop_key] = "normalize"


def _should_normalize_property(
    current: str,
    canonical: str | None,
    fingerprints: dict,
) -> bool:
    if current == _LEGACY_FABRICATED_BUILDING_LABEL:
        return True
    if not canonical:
        return False
    if looks_like_ocr_address_property(current):
        return True
    if is_false_section_building(current, fingerprints):
        return True
    if canonical == HURGHADA_UTILITIES_LABEL and belongs_to_egypt_portfolio_cluster(fingerprints):
        return True
    if current != canonical and (
        fingerprints.get("plot_or_building_ids")
        or fingerprints.get("hurghada_portfolio")
    ):
        return True
    return False


def apply_theme_assist(
    contract: ClassifyContract,
    theme_values: dict[str, str],
    auto_tail: str | None,
    *,
    text: str,
    document_briefing: str | None,
    doc_kind: str | None = None,
    document_language: str | None = None,
    structured_vision: dict[str, Any] | None = None,
    filename_tokens: list[str] | None = None,
    extraction_confidence: float | None = None,
    extraction_quality: float | None = None,
    structure_sort: bool = False,
    reconcile_country_hint: str | None = None,
) -> tuple[dict[str, str], str | None, dict[str, str]]:
    """
    Fill empty theme keys, normalize property when fingerprint matches, suggest subject.

    Returns (theme_values, auto_tail, assist_trace) where assist_trace maps
    field → source (geo, fingerprint, normalize, briefing).
    """
    filled = {k: v for k, v in theme_values.items() if isinstance(v, str)}
    assist: dict[str, str] = {}
    effective_doc_kind = _effective_doc_kind(doc_kind, structured_vision)

    _apply_country_assist(
        contract,
        filled,
        assist,
        text=text,
        document_briefing=document_briefing,
        doc_kind=effective_doc_kind,
        document_language=document_language,
        structured_vision=structured_vision,
        filename_tokens=filename_tokens,
        extraction_confidence=extraction_confidence,
        extraction_quality=extraction_quality,
        structure_sort=structure_sort,
        reconcile_country_hint=reconcile_country_hint,
    )

    _apply_property_assist(
        contract,
        filled,
        assist,
        text=text,
        document_briefing=document_briefing,
        filename_tokens=filename_tokens,
    )

    tail = (auto_tail or "").strip()
    generic_tails = {"", "other", "documents", "general", "misc", "miscellaneous"}
    if contract.has_auto_tail and (not tail or tail.lower() in generic_tails):
        suggested = suggest_subject_from_briefing(
            document_briefing, doc_kind=effective_doc_kind, text=text
        )
        if suggested:
            tail = suggested
            assist["auto_tail"] = "briefing"

    sanitized = sanitize_subject_tail(
        tail or None,
        text=text,
        document_briefing=document_briefing,
        doc_kind=effective_doc_kind,
    )
    if sanitized and sanitized != (tail or "").strip():
        assist["auto_tail"] = assist.get("auto_tail") or "sanitize"
        tail = sanitized
    elif sanitized:
        tail = sanitized

    _apply_property_fallback(
        contract,
        filled,
        assist,
        text=text,
        document_briefing=document_briefing,
        subject_tail=tail or None,
        filename_tokens=filename_tokens,
    )

    return filled, tail or None, assist


def structure_geo_hint_line(text: str) -> str:
    """Optional user-prompt line listing geography cues (structure classify only)."""
    hits = geo_hits(text)
    if not hits:
        return ""
    return (
        f"Geography hints detected in the document (use for theme_values only): "
        f"{', '.join(hits)}.\n"
    )
