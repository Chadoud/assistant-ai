"""Theme metadata for sort structure levels."""

from __future__ import annotations

from sort_structure.models import SortThemeId

THEME_UI_LABEL: dict[SortThemeId, str] = {
    "auto": "AI decides",
    "document_type": "Document type",
    "country": "Country",
    "language": "Language",
    "year": "Year",
    "person": "Person",
    "organization": "Organization",
    "property": "Property",
    "project": "Project",
    "work": "Work area",
    "custom": "Custom",
}

COUNTRY_ALIASES: dict[str, str] = {
    "usa": "United States",
    "u.s.a.": "United States",
    "u.s.": "United States",
    "us": "United States",
    "united states of america": "United States",
    "uk": "United Kingdom",
    "u.k.": "United Kingdom",
    "great britain": "United Kingdom",
    "uae": "United Arab Emirates",
}

KNOWN_COUNTRY_LABELS: frozenset[str] = frozenset(
    {
        "Egypt",
        "United Arab Emirates",
        "France",
        "Switzerland",
        "Germany",
        "Jordan",
        "Saudi Arabia",
        "Netherlands",
        "Morocco",
        "United States",
        "United Kingdom",
        "Italy",
        "Spain",
        "Canada",
        "Australia",
        *COUNTRY_ALIASES.values(),
    }
)


def is_valid_country_theme_label(raw: str) -> bool:
    """True when the LLM country value is a real country name, not a region bucket."""
    text = (raw or "").strip()
    if not text:
        return False
    key = text.lower()
    if key in COUNTRY_ALIASES:
        return True
    if text in KNOWN_COUNTRY_LABELS:
        return True
    if "region" in key or "speaking" in key or "arabic-" in key:
        return False
    return False


def theme_level_key(theme: SortThemeId, custom_label: str | None, index: int) -> str:
    """Stable JSON key for theme_values in LLM output."""
    if theme == "custom" and custom_label:
        slug = "".join(c if c.isalnum() else "_" for c in custom_label.lower()).strip("_")
        return slug[:40] or f"custom_{index}"
    return theme if theme != "auto" else f"auto_{index}"


def theme_prompt_instruction(theme: SortThemeId, custom_label: str | None, language: str) -> str:
    """Short LLM instruction for extracting one theme value."""
    label = THEME_UI_LABEL.get(theme, theme)
    if theme == "custom" and custom_label:
        return (
            f'Extract the best short folder name for "{custom_label.strip()}" '
            f"from the document (2–5 words, {language})."
        )
    instructions: dict[SortThemeId, str] = {
        "document_type": f"Document type or purpose (e.g. invoice, lease; {language}, 2–5 words).",
        "country": (
            f"Country most associated with the document ({language}, use a real country name). "
            "Never use regions like Arabic-speaking Regions. "
            "Do not infer country from company suffixes (LLC, ae, SA); use document geography."
        ),
        "language": f"Primary language of the document content ({language} language name).",
        "year": "Most relevant 4-digit year (tax year, contract year, or document date).",
        "person": f"Primary person name if clearly central ({language}, 2–5 words).",
        "organization": f"Primary company or institution ({language}, 2–5 words).",
        "property": (
            f"Building or plot identifier with landmark ({language}, 2–5 words). "
            "Use one stable label per building (e.g. Building 32 — Hospital Street). "
            "Do not use apartment number or full street OCR as the property name."
        ),
        "project": f"Project name if clearly central ({language}, 2–5 words).",
        "work": f"Work or industry area ({language}, 2–5 words).",
        "auto": (
            f"Document subject folder ({language}). Pick one: Electricity, Ownership, "
            "Payments, Contracts, Identity, Correspondence, Other."
        ),
        "custom": f"Extract value for custom theme ({language}).",
    }
    return f"{label}: {instructions.get(theme, label)}"


def other_folder_label(theme: SortThemeId, custom_label: str | None) -> str:
    """Human-readable 'Other' bucket name for cap overflow."""
    if theme == "custom" and custom_label:
        return f"Other {custom_label.strip()}"
    base = THEME_UI_LABEL.get(theme, "Items")
    if base.endswith("y") and len(base) > 2:
        return f"Other {base[:-1]}ies"
    return f"Other {base}s" if not base.endswith("s") else f"Other {base}"
