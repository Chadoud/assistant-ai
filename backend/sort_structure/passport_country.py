"""Infer passport issuer country from vision/OCR text (no extra LLM call)."""

from __future__ import annotations

import re

_PASSPORT_DOC_KIND_RE = re.compile(r"passport", re.I)
_PASSPORT_TEXT_RE = re.compile(
    r"passport|pass\s*passeport|جواز|document\s*type:\s*passport",
    re.I,
)

_LABEL_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"switzerland|schweiz|suisse|svizzera|svizra", re.I), "Switzerland"),
    (re.compile(r"\bfrance\b|république\s*française|republique\s*francaise|\bornex\b", re.I), "France"),
    (re.compile(r"netherlands|nederland|koninkrijk", re.I), "Netherlands"),
    (re.compile(r"saudi\s*arabia|المملكة\s*العربية", re.I), "Saudi Arabia"),
    (
        re.compile(
            r"united\s*arab\s*emirates|\buae\b|الإمارات|\bP<ARE",
            re.I,
        ),
        "United Arab Emirates",
    ),
    (re.compile(r"\begypt\b|مصر|جمهورية\s*مصر", re.I), "Egypt"),
    (re.compile(r"\bjordan\b|الأردن", re.I), "Jordan"),
    (re.compile(r"\bgermany\b|deutschland|bundesrepublik", re.I), "Germany"),
)

_ISO3_TO_COUNTRY: dict[str, str] = {
    "CHE": "Switzerland",
    "FRA": "France",
    "NLD": "Netherlands",
    "SAU": "Saudi Arabia",
    "ARE": "United Arab Emirates",
    "EGY": "Egypt",
    "JOR": "Jordan",
    "DEU": "Germany",
    "GBR": "United Kingdom",
    "USA": "United States",
}

_MRZ_ISO3_RE = re.compile(r"[<0-9]{5,}([A-Z]{3})[<0-9A-Z]", re.I)
_MRZ_COUNTRY_PREFIX_RE = re.compile(r"P<([A-Z]{3})", re.I)


def _looks_like_passport(hay: str, doc_kind: str | None) -> bool:
    if doc_kind and _PASSPORT_DOC_KIND_RE.search(doc_kind.replace("_", " ")):
        return True
    return bool(_PASSPORT_TEXT_RE.search(hay))


def infer_passport_country_label(
    text: str,
    document_briefing: str | None = None,
    *,
    doc_kind: str | None = None,
) -> str | None:
    """Return a country folder label when passport issuer cues are visible in text.

    The issuer country is read from the document body (OCR / MRZ) only. A
    model-written ``document_briefing`` is deliberately NOT used to match a
    country: it is the model's interpretation and may assert a country the page
    never shows (e.g. "the text suggests Saudi Arabia"), which would let a
    hallucination validate itself. The briefing is used only as a weak passport
    detector, never as a country source.
    """
    hay = " ".join(
        x
        for x in (
            (text or "")[:4000],
            (doc_kind or "").replace("_", " "),
        )
        if x
    ).strip()
    detect_hay = " ".join(
        x for x in (hay, (document_briefing or "")[:2000]) if x
    ).strip()
    if not detect_hay or not _looks_like_passport(detect_hay, doc_kind):
        return None

    for pattern, label in _LABEL_PATTERNS:
        if pattern.search(hay):
            return label

    mrz_prefix = _MRZ_COUNTRY_PREFIX_RE.search(hay.upper())
    if mrz_prefix:
        label = _ISO3_TO_COUNTRY.get(mrz_prefix.group(1).upper())
        if label:
            return label

    for match in _MRZ_ISO3_RE.finditer(hay.upper()):
        code = match.group(1).upper()
        label = _ISO3_TO_COUNTRY.get(code)
        if label:
            return label

    for code, label in _ISO3_TO_COUNTRY.items():
        if re.search(rf"\b{code}\b", hay.upper()):
            return label

    return None
