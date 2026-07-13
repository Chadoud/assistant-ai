"""Property / landmark cue detection for fingerprinting and clustering."""

from __future__ import annotations

import re

BUILDING_EXPLICIT_RE = re.compile(
    r"(?:building|عقار|بالعقار)\s*(?:no\.?|number|#|رقم)?\s*(\d{1,4})",
    re.I,
)
PLOT_EXPLICIT_RE = re.compile(
    # قلعة / قلعه ("fortress") is a frequent OCR misread of قطعة ("plot") in this
    # Hurghada land-document corpus, so it is treated as a plot cue here.
    r"(?:plot|قطعة|قطعه|قلعة|قلعه)\s*(?:no\.?|number|#|رقم)?\s*(\d{1,4})",
    re.I,
)
BARE_PLOT_32_RE = re.compile(
    r"\b(?:building|plot|عقار|قطعة|قطعه)\s*(?:no\.?|#)?\s*32\b|رقم\s*32\b|رقم\s*٣٢",
    re.I,
)
HURGHADA_RE = re.compile(
    r"hurghada|ghardaq|ghardaqa|ghardeqa|hatta|الغردقة|الغرائقة",
    re.I,
)
HOSPITAL_LANDMARK_RE = re.compile(
    r"hospital|مستشفى|health\s*directorate|مديرية\s*الصحة|مدبرية\s*الصحة|"
    r"general\s*hospital",
    re.I,
)
INTERCONTINENTAL_RE = re.compile(r"intercontinental|انتركون", re.I)
HURGHADA_PORTFOLIO_RE = re.compile(
    r"canal|قناه|قناة|شهر\s*عقار|الشهر\s*العقار|مدفوعة\s*الشهر|"
    r"ministry\s*of\s*justice|وزارة\s*العدل|real\s*estate\s*and\s*notar|"
    r"الشهر\s*العقار|قناة\s*لتوزيع|عداد|كهربا|كهرب|كهرياء|"
    r"شركة\s*القناة|القناة\s*لتوزيع",
    re.I,
)
MINISTRY_JUSTICE_RE = re.compile(
    r"ministry\s*of\s*justice|وزارة\s*العدل|real\s*estate\s*and\s*notar|الشهر\s*العقار",
    re.I,
)
# MoJ real-estate registry forms for meter installation — strong Egypt utility cue
# even when "Hurghada" or canal company text is missing from OCR (Hilal row #12).
MOJ_ELECTRICITY_METER_RE = re.compile(
    r"عداد\s*كهرب|تركيب\s*عداد|electric\s*meter\s*install|meter\s*installation",
    re.I,
)
CANAL_COMPANY_RE = re.compile(r"canal|قناه|قناة|شركة\s*القناة|القناة\s*لتوزيع", re.I)
EGP_RE = re.compile(r"\begp\b|جنية\s*مصر|جنيه\s*مصر|egyptian\s*pound", re.I)
FALSE_SECTION_BUILDING_RE = re.compile(r"^Building\s+(\d{1,2})$", re.I)
OCR_ADDRESS_HINT_RE = re.compile(
    r"apartment|street\s+of|شارع|plot\s+in|port\s+of|infrastructure\s+project|"
    r"store\s+receipt|unavailable|padi\s+al",
    re.I,
)

PROPERTY_FALLBACK_IDENTITY = "Identity Documents"
PROPERTY_FALLBACK_GENERAL = "General Property"
# Neutral, true grouping for Hurghada utility documents that share the same
# Red Sea canal-electricity portfolio but do not expose a readable plot number.
# We must never assert a specific building number we cannot read from the page.
HURGHADA_UTILITIES_LABEL = "Hurghada — Red Sea Utilities"
# Backward-compatible alias (older imports). Points at the neutral label so no
# document is stamped with a fabricated "Building 32" it never mentions.
HURGHADA_PORTFOLIO_LABEL = HURGHADA_UTILITIES_LABEL


def match_hurghada(hay: str) -> bool:
    return bool(HURGHADA_RE.search(hay))


def match_hospital_landmark(hay: str) -> bool:
    return bool(HOSPITAL_LANDMARK_RE.search(hay))


def match_intercontinental(hay: str) -> bool:
    return bool(INTERCONTINENTAL_RE.search(hay))


def match_hurghada_portfolio_cues(hay: str) -> bool:
    return bool(HURGHADA_PORTFOLIO_RE.search(hay))


def match_ministry_justice(hay: str) -> bool:
    return bool(MINISTRY_JUSTICE_RE.search(hay))


def match_moj_electricity_meter(hay: str) -> bool:
    """True for Egyptian MoJ real-estate registry electricity-meter forms."""
    if not MINISTRY_JUSTICE_RE.search(hay):
        return False
    return bool(MOJ_ELECTRICITY_METER_RE.search(hay))


def match_canal_company(hay: str) -> bool:
    return bool(CANAL_COMPANY_RE.search(hay))


def match_egp(hay: str) -> bool:
    return bool(EGP_RE.search(hay))


def match_ocr_address_property(value: str) -> bool:
    raw = (value or "").strip()
    if not raw or len(raw) < 12:
        return False
    if raw in (PROPERTY_FALLBACK_IDENTITY, PROPERTY_FALLBACK_GENERAL):
        return False
    if raw.startswith(("Building ", "Plot ")) and " — " in raw:
        return False
    if OCR_ADDRESS_HINT_RE.search(raw):
        return True
    if raw.lower() in ("hurghada", "hatta", "egypt"):
        return True
    return raw.count(" ") >= 4


def parse_building_ids(hay: str) -> list[int]:
    return _parse_ids(BUILDING_EXPLICIT_RE, hay)


def parse_plot_ids(hay: str) -> list[int]:
    return _parse_ids(PLOT_EXPLICIT_RE, hay)


HEALTH_DIRECTORATE_RE = re.compile(
    r"مديرية\s*الصحة|مدبرية\s*الصحة|مديرية\s*الصخا|مدبرية\s*الصخا|"
    r"health\s*directorate|directorate\s*of\s*health",
    re.I,
)


def plot_ids_from_filename_tokens(tokens: list[str] | None) -> list[int]:
    if not tokens:
        return []
    out: list[int] = []
    for raw in tokens:
        key = (raw or "").strip().lower().replace(" ", "")
        if not key:
            continue
        if key in ("plot32", "bldg32") or key.startswith("plot32") or key.startswith("bldg32"):
            if 32 not in out:
                out.append(32)
            continue
        m = re.match(r"^plot(\d+)$", key)
        if m:
            n = int(m.group(1))
            if 0 < n <= 9999 and n not in out:
                out.append(n)
    return out


def adjust_plot_ids_for_filename(
    hay: str,
    plot_ids: list[int],
    filename_tokens: list[str] | None,
) -> list[int]:
    """Prefer filename Plot 32 over health-directorate OCR 'قطعة 7' boilerplate."""
    filename_plots = plot_ids_from_filename_tokens(filename_tokens)
    if 32 not in filename_plots:
        return plot_ids
    if any(p != 32 for p in filename_plots):
        return plot_ids
    if 7 in plot_ids and 32 not in plot_ids:
        return [32] + [p for p in plot_ids if p != 7]
    if not plot_ids:
        return [32]
    if plot_ids and plot_ids[0] == 7 and (
        HEALTH_DIRECTORATE_RE.search(hay) or match_hospital_landmark(hay)
    ):
        return [32] + [p for p in plot_ids[1:] if p != 7]
    return plot_ids


def has_bare_plot_32(hay: str) -> bool:
    return bool(BARE_PLOT_32_RE.search(hay))


def false_section_building_number(property_label: str) -> int | None:
    match = FALSE_SECTION_BUILDING_RE.match((property_label or "").strip())
    if not match:
        return None
    return int(match.group(1))


def _parse_ids(pattern: re.Pattern[str], hay: str) -> list[int]:
    """Return matched ids in document order (first occurrence wins, deduplicated).

    Order matters: the first explicitly-labelled plot/building number in the text
    is the document's real subject, so we preserve it instead of sorting.
    """
    ids: list[int] = []
    seen: set[int] = set()
    for m in pattern.finditer(hay):
        for g in m.groups():
            if g and g.isdigit():
                n = int(g)
                if 0 < n <= 9999 and n not in seen:
                    seen.add(n)
                    ids.append(n)
    return ids
