"""Tesseract / OSD resolution and per-page OCR for ingestor."""

from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass

from constants import DEFAULT_OCR_LANG_PRIORITIES, OCR_MAX_JOIN_LANGS

logger = logging.getLogger(__name__)

# Allow the Electron host to tell us where Tesseract lives (Windows packaged app).
_TESSERACT_CMD = os.environ.get("TESSERACT_CMD")
if _TESSERACT_CMD:
    try:
        import pytesseract

        pytesseract.pytesseract.tesseract_cmd = _TESSERACT_CMD
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not apply TESSERACT_CMD=%r: %s", _TESSERACT_CMD, exc)

_TESSERACT_LANG = os.environ.get("TESSERACT_LANG", "").strip() or None
OCR_RENDER_ZOOM = min(4.0, max(1.5, float(os.environ.get("OCR_RENDER_ZOOM", "2.0") or "2.0")))

_INSTALLED_LANGS_CACHE: list[str] | None = None

_SCRIPT_TO_CODES: dict[str, tuple[str, ...]] = {
    "Arabic": ("ara",),
    "Armenian": ("hye",),
    "Bengali": ("ben",),
    "Canadian_Aboriginal": ("chr",),
    "Cherokee": ("chr",),
    "Cyrillic": ("rus", "srp", "bul", "ukr", "bel", "kaz"),
    "Devanagari": ("hin", "mar", "san", "nep", "bod"),
    "Ethiopic": ("amh", "tir"),
    "Fraktur": ("deu", "fra"),
    "Georgian": ("kat",),
    "Greek": ("ell", "grc"),
    "Gujarati": ("guj",),
    "Gurmukhi": ("pan",),
    "Han": ("chi_sim", "chi_tra", "jpn"),
    "HanS": ("chi_sim", "chi_tra"),
    "HanT": ("chi_tra", "chi_sim"),
    "Hangul": ("kor",),
    "Hebrew": ("heb",),
    "Japanese": ("jpn", "chi_tra", "chi_sim"),
    "Kannada": ("kan",),
    "Khmer": ("khm",),
    "Lao": ("lao",),
    "Malayalam": ("mal",),
    "Myanmar": ("mya",),
    "Nko": ("nqo",),
    "Oriya": ("ori",),
    "Sinhala": ("sin",),
    "Syriac": ("syr",),
    "Tamil": ("tam",),
    "Telugu": ("tel",),
    "Thaana": ("div",),
    "Thai": ("tha",),
    "Tibetan": ("bod",),
    "Vai": ("vai",),
}

_NON_LATIN_CODES = frozenset(
    {
        "chi_sim",
        "chi_tra",
        "jpn",
        "kor",
        "ara",
        "heb",
        "tha",
        "bod",
        "sin",
        "mya",
        "khm",
        "lao",
        "amh",
        "tir",
        "hye",
        "kat",
    }
)

_OCR_NON_TEXT = frozenset({"osd", "equ"})
_ARABIC_SCRIPT_RE = re.compile(r"[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]{2,}")


def _strip_non_text_ocr(codes: list[str]) -> list[str]:
    return [c for c in codes if str(c).strip() and str(c).strip().lower() not in _OCR_NON_TEXT]


def _installed_tesseract_langs() -> list[str]:
    global _INSTALLED_LANGS_CACHE
    if _INSTALLED_LANGS_CACHE is not None:
        return _INSTALLED_LANGS_CACHE
    try:
        import pytesseract

        _INSTALLED_LANGS_CACHE = sorted(pytesseract.get_languages())
    except Exception:
        _INSTALLED_LANGS_CACHE = []
    return _INSTALLED_LANGS_CACHE


def _filter_installed(whitelist: list[str]) -> list[str]:
    installed = set(_installed_tesseract_langs())
    if not installed:
        return whitelist
    return [x for x in whitelist if x in installed]


@dataclass
class OcrRuntime:
    """Resolved OCR strategy for one extraction."""

    static_lang: str | None
    allowed: list[str]
    auto_per_page: bool


def default_analyze_ocr_langs() -> list[str] | None:
    """Installed OCR packs for analyze when the job omits ``tesseract_langs``."""
    installed = _strip_non_text_ocr(_installed_tesseract_langs())
    if not installed:
        return None
    priority = _filter_installed(list(DEFAULT_OCR_LANG_PRIORITIES))
    rest = [c for c in installed if c not in priority]
    merged = _order_lang_codes(priority + rest)
    return merged or None


def resolve_ocr_runtime(
    tesseract_lang: str | None,
    tesseract_langs: list[str] | None,
    tesseract_auto: bool,
) -> OcrRuntime:
    legacy = (tesseract_lang or "").strip()
    if legacy:
        return OcrRuntime(static_lang=legacy, allowed=[], auto_per_page=False)

    raw_list = tesseract_langs if isinstance(tesseract_langs, list) else None
    cleaned = _strip_non_text_ocr([str(x).strip() for x in (raw_list or []) if str(x).strip()])
    if cleaned:
        allowed = _filter_installed(cleaned) or cleaned
        if not tesseract_auto or len(allowed) == 1:
            return OcrRuntime(static_lang="+".join(_order_lang_codes(allowed)), allowed=[], auto_per_page=False)
        return OcrRuntime(static_lang=None, allowed=allowed, auto_per_page=True)

    env = (os.environ.get("TESSERACT_LANG", "") or "").strip()
    if env:
        return OcrRuntime(static_lang=env, allowed=[], auto_per_page=False)

    installed = _installed_tesseract_langs()
    installed_text = _strip_non_text_ocr(installed)
    if len(installed_text) >= 2:
        preferred = default_analyze_ocr_langs() or installed_text
        return OcrRuntime(static_lang=None, allowed=preferred, auto_per_page=True)
    if len(installed_text) == 1:
        return OcrRuntime(static_lang=installed_text[0], allowed=[], auto_per_page=False)
    return OcrRuntime(static_lang=None, allowed=[], auto_per_page=False)


def effective_tesseract_lang(tesseract_lang: str | None) -> str | None:
    """Per-job override, else TESSERACT_LANG env."""
    job = (tesseract_lang or "").strip()
    if job:
        return job
    return _TESSERACT_LANG


def _order_lang_codes(codes: list[str]) -> list[str]:
    seen: set[str] = set()
    uniq: list[str] = []
    for c in codes:
        if c in seen:
            continue
        seen.add(c)
        uniq.append(c)
    rest = [x for x in uniq if x != "eng"]
    rest.sort()
    return (["eng"] if "eng" in uniq else []) + rest


def _osd_script(img) -> str | None:
    try:
        import pytesseract

        osd = pytesseract.image_to_osd(img)
    except Exception:
        return None
    for line in str(osd).splitlines():
        line = line.strip()
        if line.lower().startswith("script:"):
            return line.split(":", 1)[1].strip()
    return None


def _codes_for_script(script: str | None, allowed: list[str]) -> list[str]:
    if not allowed:
        return []
    allowed_set = set(allowed)
    if not script:
        return _order_lang_codes(allowed[:OCR_MAX_JOIN_LANGS])

    key = script.strip()
    if key in ("Latin", "Fraktur"):
        latin_like = [
            code for code in allowed if code not in _NON_LATIN_CODES and not code.startswith("chi_")
        ]
        if not latin_like:
            latin_like = list(allowed)
        return _order_lang_codes(latin_like[:OCR_MAX_JOIN_LANGS])

    preferred = _SCRIPT_TO_CODES.get(key)
    if not preferred:
        return _order_lang_codes(allowed[:OCR_MAX_JOIN_LANGS])

    picked = [c for c in preferred if c in allowed_set]
    if picked:
        extra = ["eng"] if "eng" in allowed_set and "eng" not in picked else []
        return _order_lang_codes((picked + extra)[:OCR_MAX_JOIN_LANGS])
    return _order_lang_codes(allowed[:OCR_MAX_JOIN_LANGS])


def _tesseract_image_to_string(img, lang: str | None) -> str:
    import pytesseract

    eff = (lang or "").strip() or None
    if eff:
        try:
            return pytesseract.image_to_string(img, lang=eff)
        except Exception as exc:  # noqa: BLE001 — fall back to default lang pack
            logger.debug("OCR with lang=%r failed (%s); retrying default lang", eff, exc)
    return pytesseract.image_to_string(img)


def tesseract_image_with_runtime(img, ocr: OcrRuntime) -> str:
    """Run Tesseract on ``img`` using resolved ``ocr`` strategy."""
    if ocr.static_lang:
        return _tesseract_image_to_string(img, ocr.static_lang)
    if not ocr.allowed:
        return _tesseract_image_to_string(img, None)
    if not ocr.auto_per_page or len(ocr.allowed) == 1:
        ordered = _order_lang_codes(ocr.allowed)
        joined = "+".join(ordered[:OCR_MAX_JOIN_LANGS])
        return _tesseract_image_to_string(img, joined or None)
    script = _osd_script(img)
    codes = _codes_for_script(script, ocr.allowed)
    joined = "+".join(codes)
    text = _tesseract_image_to_string(img, joined or None).strip()
    if text:
        return text
    broad = "+".join(_order_lang_codes(ocr.allowed)[:OCR_MAX_JOIN_LANGS])
    if broad and broad != joined:
        return _tesseract_image_to_string(img, broad)
    return text


def _arabic_token_count(text: str) -> int:
    return len(_ARABIC_SCRIPT_RE.findall(text or ""))


def maybe_retry_arabic_ocr(img, text: str, ocr: OcrRuntime) -> str:
    """
    Re-run OCR with eng+ara when the first pass shows Arabic script but may have used Latin-only langs.

    Improves filing accuracy on Egyptian / Arabic scans without forcing ara on every image.
    """
    sample = (text or "").strip()
    if _arabic_token_count(sample) < 4:
        return sample
    installed = set(_installed_tesseract_langs())
    if "ara" not in installed:
        return sample
    codes = [c for c in ("eng", "ara") if c in installed] or ["ara"]
    joined = "+".join(_order_lang_codes(codes))
    if ocr.static_lang and ocr.static_lang == joined:
        return sample
    retry = _tesseract_image_to_string(img, joined).strip()
    if not retry:
        return sample
    if _arabic_token_count(retry) > _arabic_token_count(sample) or len(retry) > len(sample) + 40:
        return retry
    return sample
