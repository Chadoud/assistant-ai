"""Geography cue detection — shared by audit, assist, gates, and cluster."""

from __future__ import annotations

import re

from sort_signals.property import match_moj_electricity_meter

GEO_CUE_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "hurghada",
        re.compile(
            r"hurghada|ghardaq|ghardaqa|ghardeqa|الغردقة|الغرائقة",
            re.I,
        ),
    ),
    (
        "red_sea",
        re.compile(r"red\s*sea|البحر\s*الاحمر|البحر\s*الأحمر|bahr\s*al", re.I),
    ),
    (
        "canal_electricity",
        re.compile(r"القناة|القناه|canal\s*company|توزيع\s*الكه", re.I),
    ),
    ("egp", re.compile(r"\begp\b|جنية\s*مصر|جنيه\s*مصر|egyptian\s*pound", re.I)),
    (
        "uae",
        re.compile(r"\buae\b|united\s*arab\s*emirates|الإمارات|dubai|abu\s*dhabi", re.I),
    ),
    ("egypt_en", re.compile(r"\begypt\b|misr|مصر", re.I)),
)

STRONG_EGYPT_HIT_LABELS = frozenset(
    {"hurghada", "red_sea", "canal_electricity", "egp", "egypt_en"}
)

FOLDER_REGION_BY_SEGMENT: dict[str, str] = {
    "egypt": "egypt",
    "united arab emirates": "uae",
    "uae": "uae",
    "france": "france",
    "switzerland": "switzerland",
    "germany": "germany",
}

REGION_ID_TO_COUNTRY_LABEL: dict[str, str] = {
    "egypt": "Egypt",
    "uae": "United Arab Emirates",
    "france": "France",
    "switzerland": "Switzerland",
    "germany": "Germany",
    "jordan": "Jordan",
    "saudi_arabia": "Saudi Arabia",
}


def region_id_to_country_label(region_id: str) -> str | None:
    return REGION_ID_TO_COUNTRY_LABEL.get((region_id or "").strip().lower())


def geo_hits(text: str, *, max_hits: int = 8) -> list[str]:
    """Return matched geography cue labels from extracted text."""
    sample = (text or "")[:12000]
    hits: list[str] = []
    for label, pat in GEO_CUE_PATTERNS:
        if pat.search(sample):
            hits.append(label)
        if len(hits) >= max_hits:
            break
    return hits


def infer_document_regions(text: str) -> set[str]:
    """
    Infer country/region ids from explicit geographic cues in the document body.

    Conservative: requires strong hits (e.g. Hurghada, EGP), not Arabic script alone.
    MoJ real-estate electricity-meter forms are treated as Egypt even without a
    city name in OCR (common on scanned utility paperwork).
    """
    hits = set(geo_hits(text))
    regions: set[str] = set()
    if hits & STRONG_EGYPT_HIT_LABELS:
        regions.add("egypt")
    if match_moj_electricity_meter(text):
        regions.add("egypt")
    if "uae" in hits:
        regions.add("uae")
    return regions


def folder_top_region(folder_name: str) -> str | None:
    """Map the first folder path segment to a normalized region id, if known."""
    seg = (folder_name or "").strip().lower().split("/")[0].strip()
    if not seg:
        return None
    return FOLDER_REGION_BY_SEGMENT.get(seg)


def geographic_folder_conflict(text: str, folder_name: str) -> str | None:
    """Return a short reason when document geography clearly contradicts the folder region."""
    doc_regions = infer_document_regions(text)
    folder_region = folder_top_region(folder_name)
    if not doc_regions or not folder_region:
        return None
    if folder_region in doc_regions:
        return None
    if len(doc_regions) != 1:
        return None
    doc_region = next(iter(doc_regions))
    return (
        f"Document geography ({doc_region}) conflicts with folder region ({folder_region}); "
        "manual review required"
    )


def geo_rerank_adjustment(text: str, candidate_folder: str) -> float:
    """Score delta for rerank when folder region matches or conflicts with doc geography."""
    doc_regions = infer_document_regions(text)
    folder_region = folder_top_region(candidate_folder)
    if not doc_regions or not folder_region:
        return 0.0
    if folder_region in doc_regions:
        return 0.22
    if len(doc_regions) == 1:
        return -0.3
    return 0.0


def geo_supports_new_folder(text: str, folder_name: str) -> bool:
    """Allow creating a new folder when its region matches explicit document geography."""
    doc_regions = infer_document_regions(text)
    folder_region = folder_top_region(folder_name)
    return bool(doc_regions and folder_region and folder_region in doc_regions)


def country_label_supported_by_geo(country_label: str, text: str) -> bool:
    """True when explicit geo cues support the given country folder label."""
    label = (country_label or "").strip()
    if not label:
        return False
    regions = infer_document_regions(text)
    for region_id in regions:
        if region_id_to_country_label(region_id) == label:
            return True
    if label == "United Arab Emirates":
        return "uae" in geo_hits(text)
    return False


COUNTRY_TEXT_ALIASES: dict[str, re.Pattern[str]] = {
    "Switzerland": re.compile(r"switzerland|schweiz|suisse|svizzera|svizra", re.I),
    "France": re.compile(r"\bfrance\b|française|francaise|république\s*française", re.I),
    "Germany": re.compile(r"\bgermany\b|deutschland|bundesrepublik", re.I),
    "Netherlands": re.compile(r"netherlands|nederland|koninkrijk", re.I),
    "Saudi Arabia": re.compile(r"saudi\s*arabia|السعودية|المملكة\s*العربية", re.I),
    "United Arab Emirates": re.compile(
        r"united\s*arab\s*emirates|\buae\b|الإمارات|dubai|abu\s*dhabi", re.I
    ),
    "Egypt": re.compile(r"\begypt\b|misr|مصر", re.I),
    "Jordan": re.compile(r"\bjordan\b|الأردن", re.I),
}


# Languages that reasonably pin a document to a small set of countries. Broad
# languages (Arabic, English, Spanish) are intentionally excluded: they are
# spoken across too many countries to corroborate a specific one, so a document
# language alone must not validate e.g. "Saudi Arabia" or "United States".
LANGUAGE_COUNTRY_HINTS: dict[str, frozenset[str]] = {
    "french": frozenset({"France", "Switzerland"}),
    "german": frozenset({"Germany", "Switzerland", "Austria"}),
    "dutch": frozenset({"Netherlands"}),
    "italian": frozenset({"Italy", "Switzerland"}),
    "portuguese": frozenset({"Portugal"}),
}


def country_supported_by_language(country_label: str, detected_language: str | None) -> bool:
    """True when the document's detected language plausibly maps to the country.

    Uses the OCR-derived language (not the model's briefing) and only for
    languages tied to a small country set — never broad languages like Arabic.
    """
    label = (country_label or "").strip()
    lang = (detected_language or "").strip().lower()
    if not label or not lang:
        return False
    return label in LANGUAGE_COUNTRY_HINTS.get(lang, frozenset())


def country_label_supported_by_text(country_label: str, text: str) -> bool:
    """True when the country is corroborated by geo cues or a literal mention.

    Only the document body (OCR) is inspected — never a model-written briefing —
    so a hallucinated country in the briefing cannot validate itself.
    """
    label = (country_label or "").strip()
    if not label:
        return False
    if country_label_supported_by_geo(label, text):
        return True
    sample = text or ""
    alias = COUNTRY_TEXT_ALIASES.get(label)
    if alias and alias.search(sample):
        return True
    return bool(re.search(rf"\b{re.escape(label)}\b", sample, re.I))


_FILENAME_COUNTRY_TOKENS: dict[str, str] = {
    "egypt": "Egypt",
    "france": "France",
    "switzerland": "Switzerland",
    "germany": "Germany",
    "jordan": "Jordan",
    "uae": "United Arab Emirates",
}


def country_from_filename_tokens(tokens: list[str] | None) -> str | None:
    """Map degraded-scan filename tokens to a country label when unambiguous."""
    if not tokens:
        return None
    for raw in tokens:
        key = (raw or "").strip().lower()
        if not key:
            continue
        label = _FILENAME_COUNTRY_TOKENS.get(key)
        if label:
            return label
        if key.startswith("egypt"):
            return "Egypt"
        if key.startswith("france"):
            return "France"
        if key.startswith("switzerland"):
            return "Switzerland"
    return None
