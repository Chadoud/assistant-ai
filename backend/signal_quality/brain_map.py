"""Gate sorted files/folders and tasks from the second-brain map (personal knowledge only)."""

from __future__ import annotations

import re

from signal_quality.constants import AUTO_MEMORY_HIDDEN_NOISE_THRESHOLD
from signal_quality.evaluate import (
    SignalTier,
    evaluate_text,
    is_mail_security_notification,
    mail_task_allowed,
)

_MAIL_SOURCES = frozenset({"gmail", "outlook"})

# Path segments the sort pipeline uses for bulk / low-value mail buckets.
_NOISE_FOLDER_SEGMENT = re.compile(
    r"(^|[/\\])(newsletters?|promotions?|marketing|mailing[\s_-]?lists?|"
    r"spam|junk|trash|quora|substack|unwanted|delete[\s_-]?later|"
    r"social[\s_-]?media|forums?|digests?)([/\\]|$)",
    re.IGNORECASE,
)

_NOISE_FOLDER_LEAF = re.compile(
    r"^(newsletters?|promotions?|marketing|quora\s*digest|mailing[\s_-]?list|"
    r"spam|junk|trash|unsubscribe)$",
    re.IGNORECASE,
)


def _folder_name_is_noise_bucket(folder_name: str) -> bool:
    name = (folder_name or "").strip()
    if not name:
        return False
    if _NOISE_FOLDER_SEGMENT.search(name):
        return True
    leaf = name.replace("\\", "/").rsplit("/", 1)[-1].strip()
    return bool(_NOISE_FOLDER_LEAF.match(leaf))


def _text_allowed_for_brain_map(text: str) -> bool:
    combined = (text or "").strip()
    if len(combined) < 4:
        return False
    verdict = evaluate_text(combined)
    if verdict.tier != SignalTier.ALLOW:
        return False
    return verdict.score < AUTO_MEMORY_HIDDEN_NOISE_THRESHOLD


def folder_allowed_on_brain_map(
    folder_name: str,
    *,
    profile: str = "",
) -> bool:
    """
    False when a sorted folder is a known low-value bucket or reads as promotional.

    Uses folder name + profile only — file excerpts are filtered per row so one promo
    mail in a real folder does not hide the whole bucket.
    """
    if _folder_name_is_noise_bucket(folder_name):
        return False
    hints = " ".join(
        part
        for part in (
            folder_name.replace("/", " ").replace("\\", " "),
            profile,
        )
        if part
    )
    if not hints.strip():
        return True
    return _text_allowed_for_brain_map(hints)


# Dev / config artifacts that add noise when sorted into generic folders.
_CONFIG_FILE_NAMES = frozenset(
    {
        "integration-config.json",
        "package-lock.json",
        "yarn.lock",
        "pnpm-lock.yaml",
        "composer.lock",
        "tsconfig.json",
        "jsconfig.json",
        ".env",
        ".env.example",
        ".env.local",
    }
)

_RAW_JSON_EXCERPT = re.compile(
    r'^\s*[\[{]\s*"(?:_comment|version|dependencies|devDependencies|name)"\s*:',
    re.IGNORECASE,
)

_TRANSACTIONAL_TASK_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(p, re.IGNORECASE)
    for p in (
        r"\b(uber|lyft|bolt|doordash|deliveroo|just\s+eat|grubhub)\b",
        r"\b(votre\s+course|your\s+(trip|ride|order)|ride\s+with)\b",
        r"\b(pourboire|tip\s+for\s+your|receipt|reçu|quittung)\b",
        r"\b(thank\s+you\s+for\s+your\s+order|payment\s+(received|confirmed))\b",
        r"\b(order\s+confirmation|shipping\s+confirmation)\b",
    )
)

_DEV_TASK_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(p, re.IGNORECASE)
    for p in (
        r"integration-config\.json",
        r'"\s*_comment\s*"\s*:',
        r'"\s*dependencies\s*"\s*:',
        r"\bpackage-lock\.json\b",
    )
)

_ACTIONABLE_TASK_CUES: tuple[re.Pattern[str], ...] = tuple(
    re.compile(p, re.IGNORECASE)
    for p in (
        r"\b(todo|to\s+do|follow[\s-]?up|deadline|action\s+required)\b",
        r"\b(rsvp|respond|reply|schedule|prepare|submit|review|"
        r"sign(?:ed|ing|ature| off| up| here| the| this| contract| document)|approve)\b",
        r"\b(call|send|book|confirm|complete|finish|deliver|fix|update)\b",
        r"\b(meeting|interview|presentation|proposal|contract)\b",
    )
)


def _looks_transactional_task(text: str) -> bool:
    combined = (text or "").strip()
    if not combined:
        return False
    if any(pat.search(combined) for pat in _DEV_TASK_PATTERNS):
        return True
    if any(pat.search(combined) for pat in _TRANSACTIONAL_TASK_PATTERNS):
        if not any(cue.search(combined) for cue in _ACTIONABLE_TASK_CUES):
            return True
    return False


def _config_file_name(name: str) -> bool:
    lowered = (name or "").strip().lower()
    if lowered in _CONFIG_FILE_NAMES:
        return True
    if lowered.endswith(".lock") or lowered.endswith(".map"):
        return True
    return lowered.startswith(".env")


def task_map_eligible(description: str, source: str) -> bool:
    """
    Whether an open task belongs on the mind map.

    Mail-sourced rows must pass the mail signal gate and read as actionable —
    receipts, ride summaries, and config snippets are excluded.
    """
    desc = (description or "").strip()
    if len(desc) < 4:
        return False
    src = (source or "").strip().lower()
    if src in _MAIL_SOURCES:
        if is_mail_security_notification(desc):
            return False
        if not mail_task_allowed(desc):
            return False
        if _looks_transactional_task(desc):
            return False
        if not any(cue.search(desc) for cue in _ACTIONABLE_TASK_CUES):
            return False
        return True
    if _looks_transactional_task(desc):
        return False
    return True


def file_allowed_on_brain_map(*, name: str, excerpt: str) -> bool:
    """False for config artifacts, mailing-list subjects, and promotional excerpts."""
    if _config_file_name(name):
        return False
    excerpt_clean = (excerpt or "").strip()
    if _RAW_JSON_EXCERPT.match(excerpt_clean):
        return False
    return _text_allowed_for_brain_map(f"{name} — {excerpt}")
