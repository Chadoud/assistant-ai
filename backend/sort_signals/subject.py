"""Subject folder cue detection (Electricity, Payments, etc.)."""

from __future__ import annotations

import re

ELECTRICITY_SUBJECT_RE = re.compile(
    r"electric|كهرب|كهربا|كهرياء|عداد|canal\s*company|utility\s*connection|"
    r"utility\s*bill|wiring|power\s*connection|توزيع\s*الكهرب|health\s*inspection",
    re.I,
)
OWNERSHIP_SUBJECT_RE = re.compile(
    r"power\s*of\s*attorney|توكيل|authoriz.*sale|\bpoa\b|ownership|property\s*sale|deed",
    re.I,
)
PAYMENTS_SUBJECT_RE = re.compile(
    r"registry\s*fee|الشهر\s*عقار|cash\s*deposit|مدفوعة|سداد|payment\s*receipt|"
    r"ايداع|deposit\s*slip|رسوم",
    re.I,
)
REGISTRATION_SUBJECT_RE = re.compile(
    r"boat\s*registration|vessel|\byacht\b|boat\s*certificate|قيد\s*قارب|تسجيل\s*قارب",
    re.I,
)
CONTRACTS_SUBJECT_RE = re.compile(
    r"\blease\b|rental\s*agreement|contract|agreement|إقرار",
    re.I,
)
IDENTITY_SUBJECT_RE = re.compile(r"passport|جواز|identity\s*document|pass\s*passeport", re.I)
CORRESPONDENCE_SUBJECT_RE = re.compile(r"formal\s*letter|correspondence|letter\s*from", re.I)

SUBJECT_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("Electricity", ELECTRICITY_SUBJECT_RE),
    ("Payments", PAYMENTS_SUBJECT_RE),
    ("Ownership", OWNERSHIP_SUBJECT_RE),
    ("Registration", REGISTRATION_SUBJECT_RE),
    ("Contracts", CONTRACTS_SUBJECT_RE),
    ("Identity", IDENTITY_SUBJECT_RE),
    ("Correspondence", CORRESPONDENCE_SUBJECT_RE),
)


def match_electricity_subject(hay: str) -> bool:
    return bool(ELECTRICITY_SUBJECT_RE.search(hay))


def suggest_subject_from_text(
    text: str | None,
    *,
    document_briefing: str | None = None,
    doc_kind: str | None = None,
) -> str | None:
    """Suggest a canonical subject from text, briefing, and doc_kind."""
    hay = " ".join(
        x
        for x in (
            (document_briefing or "").strip(),
            (doc_kind or "").replace("_", " "),
            (text or "")[:2000],
        )
        if x
    ).strip()
    if not hay:
        return None
    for label, pat in SUBJECT_PATTERNS:
        if pat.search(hay):
            return label
    return None
