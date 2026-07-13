"""Property fingerprint extraction for assist normalize and batch clustering."""

from __future__ import annotations

from sort_signals.property import (
    HURGHADA_PORTFOLIO_LABEL,
    HURGHADA_UTILITIES_LABEL,
    PROPERTY_FALLBACK_GENERAL,
    PROPERTY_FALLBACK_IDENTITY,
    adjust_plot_ids_for_filename,
    false_section_building_number,
    has_bare_plot_32,
    match_canal_company,
    match_egp,
    match_hospital_landmark,
    match_hurghada,
    match_hurghada_portfolio_cues,
    match_intercontinental,
    match_ministry_justice,
    match_moj_electricity_meter,
    match_ocr_address_property,
    parse_building_ids,
    parse_plot_ids,
)

__all__ = [
    "HURGHADA_PORTFOLIO_LABEL",
    "HURGHADA_UTILITIES_LABEL",
    "PROPERTY_FALLBACK_GENERAL",
    "PROPERTY_FALLBACK_IDENTITY",
    "belongs_to_egypt_portfolio_cluster",
    "belongs_to_hurghada_portfolio",
    "canonical_property_label",
    "extract_property_fingerprints",
    "is_false_section_building",
    "looks_like_ocr_address_property",
    "primary_property_id",
    "property_cluster_key",
]


def extract_property_fingerprints(
    text: str,
    document_briefing: str | None = None,
    *,
    filename_tokens: list[str] | None = None,
) -> dict:
    """Extract plot/building ids and landmark cues from document text."""
    hay = "\n".join(x for x in (text or "", document_briefing or "") if x).strip()
    if not hay:
        return _empty_fingerprints()

    building_ids = parse_building_ids(hay)
    plot_ids = adjust_plot_ids_for_filename(
        hay, parse_plot_ids(hay), filename_tokens
    )
    if has_bare_plot_32(hay) and 32 not in plot_ids:
        plot_ids = plot_ids + [32]

    hurghada = match_hurghada(hay)
    hospital = match_hospital_landmark(hay)
    canal = match_canal_company(hay)
    moj = match_ministry_justice(hay)
    moj_meter = match_moj_electricity_meter(hay)
    portfolio = (
        match_hurghada_portfolio_cues(hay) and (hurghada or hospital or (moj and canal))
    ) or moj_meter

    # Preserve document order; a real "plot 7" must not be discarded just because
    # a health-directorate landmark is also present. The plot number is the truth.
    all_ids: list[int] = []
    for i in plot_ids + building_ids:
        if i not in all_ids:
            all_ids.append(i)
    return {
        "building_ids": building_ids,
        "plot_ids": plot_ids,
        "plot_or_building_ids": all_ids,
        "hurghada": hurghada,
        "hospital_landmark": hospital,
        "intercontinental": match_intercontinental(hay),
        "hurghada_portfolio": portfolio,
        "canal_company": canal,
        "egp": match_egp(hay),
        "moj_electricity_meter": moj_meter,
    }


def primary_property_id(fingerprints: dict) -> tuple[str, int] | None:
    """Return (kind, number) for the document's real plot/building, or None.

    Prefers an explicit plot number over a building number, using document order
    so the first labelled number (the subject of the page) wins.
    """
    plot_ids = fingerprints.get("plot_ids") or []
    building_ids = fingerprints.get("building_ids") or []
    if plot_ids:
        return ("Plot", plot_ids[0])
    if building_ids:
        return ("Building", building_ids[0])
    return None


def canonical_property_label(fingerprints: dict) -> str | None:
    """Map fingerprints to a stable property folder segment.

    We label a document with the plot/building number it actually states. Only
    when no number is readable do we fall back to a neutral portfolio grouping —
    never a fabricated building number.
    """
    ids = fingerprints.get("plot_or_building_ids") or []
    hurghada = fingerprints.get("hurghada")

    if 204 in ids and fingerprints.get("intercontinental"):
        return "Plot 204 — Intercontinental"

    primary = primary_property_id(fingerprints)
    if primary is not None:
        kind, number = primary
        if hurghada:
            return f"{kind} {number} — Hurghada"
        return f"{kind} {number}"

    # No readable plot/building number → neutral, honest grouping only when the
    # document clearly belongs to the Hurghada Red Sea utilities portfolio.
    if belongs_to_hurghada_portfolio(fingerprints) or (
        hurghada and (fingerprints.get("canal_company") or fingerprints.get("egp"))
    ):
        return HURGHADA_UTILITIES_LABEL
    return None


def belongs_to_hurghada_portfolio(fingerprints: dict) -> bool:
    """True when document text matches the Hurghada Red Sea utilities portfolio."""
    if fingerprints.get("hurghada_portfolio"):
        return True
    if fingerprints.get("moj_electricity_meter"):
        return True
    return bool(fingerprints.get("hurghada") and fingerprints.get("hospital_landmark"))


def belongs_to_egypt_portfolio_cluster(fingerprints: dict) -> bool:
    """Broader Egypt portfolio: Hurghada hospital batch or canal/EGP utility payments."""
    if belongs_to_hurghada_portfolio(fingerprints):
        return True
    if fingerprints.get("canal_company") and fingerprints.get("egp"):
        return True
    return bool(fingerprints.get("hurghada") and fingerprints.get("egp"))


def is_false_section_building(property_label: str, fingerprints: dict) -> bool:
    """True when an LLM 'Building N' segment is a stray OCR number, not a real plot.

    A number is only 'false' when it does NOT match any plot/building the document
    actually states. If the page really says plot 7, then 'Building 7' is correct
    and must be kept (normalized to the real plot label elsewhere).
    """
    number = false_section_building_number(property_label)
    if number is None:
        return False
    ids = fingerprints.get("plot_or_building_ids") or []
    if number in ids:
        return False
    return belongs_to_egypt_portfolio_cluster(fingerprints)


def property_cluster_key(country: str, fingerprints: dict) -> str | None:
    """Opaque grouping key for batch clustering.

    Documents cluster only when they share the same country AND the same real
    plot/building number. Portfolio documents with no readable number share a
    single neutral utilities bucket — they are grouped but never assigned a plot.
    """
    if not (country or "").strip():
        return None
    country_key = country.strip().lower()

    primary = primary_property_id(fingerprints)
    if primary is not None:
        kind, number = primary
        return f"{country_key}|{kind.lower()}|{number}"

    if belongs_to_egypt_portfolio_cluster(fingerprints):
        return f"{country_key}|hurghada_utilities"
    return None


def looks_like_ocr_address_property(value: str) -> bool:
    """True when LLM property segment looks like a street/apartment OCR string."""
    return match_ocr_address_property(value)


def _empty_fingerprints() -> dict:
    return {
        "building_ids": [],
        "plot_ids": [],
        "plot_or_building_ids": [],
        "hurghada": False,
        "hospital_landmark": False,
        "intercontinental": False,
        "hurghada_portfolio": False,
        "canal_company": False,
        "egp": False,
        "moj_electricity_meter": False,
    }
