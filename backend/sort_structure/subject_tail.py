"""Normalize auto_tail to a single subject folder segment."""

from __future__ import annotations

import re

_SUBJECT_VOCAB: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("Electricity", re.compile(
        r"electric|كهرب|كهربا|كهرياء|عداد|utility|wiring|power\s*connection",
        re.I,
    )),
    ("Payments", re.compile(
        r"payment|deposit|receipt|bank|finance|cash|مدفوعة|سداد|ايداع|"
        r"الشهر\s*العقار|رسوم|retail|store",
        re.I,
    )),
    ("Ownership", re.compile(
        r"ownership|\bpoa\b|power\s*of\s*attorney|توكيل|property\s*sale|deed|ملكية",
        re.I,
    )),
    ("Registration", re.compile(
        r"boat\s*registration|vessel|boat|yacht|قيد\s*قارب|تسجيل\s*قارب",
        re.I,
    )),
    ("Contracts", re.compile(r"contract|lease|agreement|إقرار|correspondence", re.I)),
    ("Identity", re.compile(r"identity|passport|visa|جواز|travel\s*card", re.I)),
    ("Correspondence", re.compile(r"letter|correspondence|gaca|filing", re.I)),
)

_GENERIC_SUBJECTS = frozenset(
    {"other", "documents", "general", "misc", "miscellaneous", "forms"}
)


def _match_subject_vocab(hay: str) -> str | None:
    for label, pat in _SUBJECT_VOCAB:
        if pat.search(hay):
            return label
    return None


def sanitize_subject_tail(
    raw: str | None,
    *,
    text: str | None = None,
    document_briefing: str | None = None,
    doc_kind: str | None = None,
) -> str | None:
    """
    Collapse LLM auto_tail paths to one controlled subject segment.

    Examples:
      /Utility Bills/Electricity -> Electricity
      Identity/Passports -> Identity
    """
    tail = (raw or "").strip().strip("/")
    if not tail:
        tail = ""
    parts = [p.strip() for p in tail.replace("\\", "/").split("/") if p.strip()]
    if parts:
        tail = parts[-1]
    if tail.lower() in _GENERIC_SUBJECTS:
        tail = ""

    hay = " ".join(
        x
        for x in (
            tail,
            " ".join(parts),
            (document_briefing or "")[:1500],
            (doc_kind or "").replace("_", " "),
            (text or "")[:1500],
        )
        if x
    )
    mapped = _match_subject_vocab(hay)
    if mapped:
        return mapped
    if not tail:
        return None
    cleaned = re.sub(r"[_]+", " ", tail).strip()
    if cleaned.lower() in _GENERIC_SUBJECTS:
        return None
    return cleaned[:80] if cleaned else None
