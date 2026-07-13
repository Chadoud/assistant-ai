"""Document-kind heuristics (boat, passport) for cluster exclusions."""

from __future__ import annotations

import re

BOAT_DOCUMENT_RE = re.compile(
    r"boat|marina|harbor|harbour|sea\s*certificate|yacht|vessel|boat\s*registration",
    re.I,
)
PASSPORT_DOCUMENT_RE = re.compile(
    r"passport|جواز|pass\s*passeport|document\s*type:\s*passport",
    re.I,
)


def is_boat_document(*text_parts: str) -> bool:
    hay = " ".join((p or "").strip() for p in text_parts if p).lower()
    return bool(hay and BOAT_DOCUMENT_RE.search(hay))


def is_passport_document(*text_parts: str) -> bool:
    hay = " ".join((p or "").strip() for p in text_parts if p).lower()
    return bool(hay and PASSPORT_DOCUMENT_RE.search(hay))
