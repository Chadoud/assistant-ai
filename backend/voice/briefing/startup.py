"""Startup briefing consent, routine lookup, and opening messages."""

from __future__ import annotations

from assistant_memory import load_memory
from voice.briefing.sections import SECTION_REGISTRY, _resolve_greeting
from voice_briefing_consent import STARTUP_BRIEFING_CONSENT_KEY


def get_startup_message() -> str | None:
    """
    Return the saved startup routine string, or None if absent or disabled.

    Treats the literal value "none" as disabled so the user can clear it by
    saying "remove my startup routine" (which saves value="none").
    """
    value = load_memory().get("preferences", {}).get("startup_routine", "").strip()
    if not value or value.lower() == "none":
        return None
    return value


def get_startup_briefing_consent() -> str | None:
    """
    Return persisted briefing auto-run preference.

    - ``granted`` — run the briefing on open without asking.
    - ``declined`` — never auto-run; user can still ask manually.
    - ``None`` — unset; ask once before the first briefing.
    """
    prefs = load_memory().get("preferences", {})
    value = prefs.get(STARTUP_BRIEFING_CONSENT_KEY, "").strip().lower()
    if value == "granted":
        return "granted"
    if value == "declined":
        return "declined"
    return None


def resolve_startup_briefing_mode(
    routine: str | None,
    consent: str | None,
) -> str:
    """
    Decide how startup briefing should behave for this voice connect.

    @returns ``skip``, ``auto``, or ``ask``.
    """
    if not routine:
        return "skip"
    if consent == "declined":
        return "skip"
    if consent == "granted":
        return "auto"
    return "ask"


def _briefing_section_hints(routine: str) -> str:
    """Short spoken hint for what the saved routine covers."""
    lower = routine.lower()
    labels: list[str] = []
    for label, spec in SECTION_REGISTRY.items():
        if any(keyword in lower for keyword in spec.keywords):
            labels.append(label)
    if not labels:
        return "what they saved"
    if len(labels) == 1:
        return labels[0]
    return ", ".join(labels[:-1]) + f", and {labels[-1]}"


def build_auto_startup_message(routine: str) -> str:
    greeting = _resolve_greeting(routine)
    if greeting:
        return (
            f"[STARTUP] Say '{greeting}' to the user right now. "
            "Then, in one brief sentence, tell them you are fetching "
            "their briefing. Stop — do not say anything else."
        )
    return (
        "[STARTUP] In one sentence, tell the user you are fetching "
        "their briefing now. Stop after that one sentence."
    )


def build_ask_startup_message(routine: str) -> str:
    """Ask whether to run the briefing — do not fetch until the user agrees."""
    greeting = _resolve_greeting(routine)
    hints = _briefing_section_hints(routine)
    greet_clause = f"Say '{greeting}' once. Then " if greeting else ""
    return (
        f"[STARTUP] {greet_clause}ask in one short natural sentence whether they want "
        f"their briefing now (it covers {hints}). Wait for yes or no — do NOT fetch "
        "or start the briefing yet."
    )
