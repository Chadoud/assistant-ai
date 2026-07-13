"""Deterministic OAuth consent playbooks — rule-based actions before vision.

High-friction consent screens (Google unverified app, Notion page picker, Microsoft
admin consent) should not burn vision quota. This module matches URL/DOM patterns and
returns the next action without calling a model.
"""

from __future__ import annotations

from typing import Any

# Accessible-name hints that mean "do not click" (deny / cancel paths).
_DENY_HINTS = (
    "cancel",
    "deny",
    "decline",
    "reject",
    "back to safety",
    "annuler",
    "refuser",
    "retour",
    "abbrechen",
    "ablehnen",
)

# Google unverified-app warning: expand Advanced, then proceed via unsafe link.
_GOOGLE_WARNING_URL_MARKERS = ("oauth/warning", "signin/oauth/warning")
_GOOGLE_ADVANCED_HINTS = ("advanced", "avancé", "avance", "erweitert", "avanzate")
_GOOGLE_UNSAFE_PROCEED_HINTS = (
    "unsafe",
    "go to ",
    "accéder",
    "access ",
    "continuer vers",
    "continue to",
    "weiter zu",
    "proceed",
)

# Notion multi-step consent
_NOTION_SELECT_PAGES_HINTS = (
    "select pages",
    "sélectionner des pages",
    "seiten auswählen",
    "select all",
    "tout sélectionner",
)

# Microsoft tenant admin consent
_MS_ADMIN_CONSENT_HINTS = (
    "need admin approval",
    "admin approval",
    "requires admin",
    "approval administrateur",
)

_GRANT_HINTS = (
    "allow access",
    "allow",
    "authorize",
    "approve",
    "connect",
    "confirm",
    "accept",
    "donner l'accès",
    "autoriser",
    "continuer",
    "continue",
)


def _normalize_name(element: dict[str, Any]) -> str:
    return " ".join(
        str(element.get(field) or "")
        for field in ("name", "text", "ariaLabel", "placeholder")
    ).lower()


def _element_text_blob(elements: list[dict[str, Any]]) -> str:
    parts: list[str] = []
    for el in elements:
        parts.append(_normalize_name(el))
    return " ".join(parts)


def _find_element_by_hints(
    elements: list[dict[str, Any]],
    hints: tuple[str, ...],
    *,
    exclude_denies: bool = True,
) -> dict[str, Any] | None:
    for el in elements:
        name = _normalize_name(el)
        if not name:
            continue
        if exclude_denies and any(h in name for h in _DENY_HINTS):
            continue
        if any(h in name for h in hints):
            return el
    return None


def _click_ref_action(element: dict[str, Any], reason: str) -> dict[str, Any]:
    return {
        "type": "click",
        "ref": element.get("ref"),
        "value": None,
        "reason": reason,
        "playbook": True,
    }


def _wait_action(reason: str) -> dict[str, Any]:
    return {"type": "wait", "ref": None, "value": None, "reason": reason, "playbook": True}


def _need_user_action(reason: str) -> dict[str, Any]:
    return {"type": "need_user", "ref": None, "value": None, "reason": reason, "playbook": True}


def _history_mentions(history: list[str], needle: str) -> bool:
    blob = " ".join(str(h).lower() for h in history)
    return needle.lower() in blob


def try_playbook_web(
    *,
    url: str,
    elements: list[dict[str, Any]],
    history: list[str] | None = None,
    provider: str = "",
) -> dict[str, Any] | None:
    """Return a DOM action dict if a playbook applies, else None.

    Action shape matches ``web_navigator`` output: ``{type, ref, value, reason}``.
    """
    history = history or []
    url_lower = (url or "").lower()
    blob = _element_text_blob(elements)
    provider_lower = (provider or "").lower()

    # Microsoft admin consent — human-only.
    if any(m in url_lower for m in ("adminconsent", "admin_consent")) or any(
        h in blob for h in _MS_ADMIN_CONSENT_HINTS
    ):
        return _need_user_action(
            "Your organization requires an admin to approve this app — ask your IT admin "
            "to allow it in Microsoft Entra, then try again."
        )

    # Google unverified-app warning.
    if any(m in url_lower for m in _GOOGLE_WARNING_URL_MARKERS) or "hasn't verified" in blob or "has not verified" in blob:
        unsafe = _find_element_by_hints(elements, _GOOGLE_UNSAFE_PROCEED_HINTS)
        if unsafe is not None and (
            _history_mentions(history, "advanced")
            or _history_mentions(history, "avancé")
            or _history_mentions(history, "expanded")
        ):
            return _click_ref_action(
                unsafe,
                "Proceed past Google's unverified-app warning (unsafe link).",
            )
        advanced = _find_element_by_hints(elements, _GOOGLE_ADVANCED_HINTS)
        if advanced is not None and not _history_mentions(history, "advanced"):
            return _click_ref_action(advanced, "Expand Advanced on Google's unverified-app warning.")
        if advanced is None and unsafe is None:
            return _wait_action("Waiting for Google's unverified-app warning to render.")

    # Notion select pages before grant.
    if "notion" in provider_lower or "notion.com" in url_lower:
        grant = _find_element_by_hints(elements, _GRANT_HINTS)
        select_pages = _find_element_by_hints(elements, _NOTION_SELECT_PAGES_HINTS)
        if select_pages is not None and not _history_mentions(history, "select pages"):
            return _click_ref_action(select_pages, "Open Notion page picker before granting access.")
        if grant is not None and _history_mentions(history, "select pages"):
            return _click_ref_action(grant, "Grant Notion access after pages selected.")

    # Generic grant button when no special screen matched.
    grant = _find_element_by_hints(elements, _GRANT_HINTS)
    if grant is not None and "oauth/warning" not in url_lower:
        return _click_ref_action(grant, "Click the consent grant button.")

    return None


def try_playbook_desktop(
    *,
    history: list[str] | None = None,
    url: str = "",
    screen_text: str = "",
    provider: str = "",
) -> dict[str, Any] | None:
    """Return a desktop action dict if a playbook applies, else None.

    Action shape matches ``desktop_navigator`` output: ``{type, x, y, reason}``.
    Desktop path cannot use DOM refs — returns ``need_user`` with exact instructions
    when we recognize a screen but cannot click reliably without vision.
    """
    history = history or []
    url_lower = (url or "").lower()
    blob = f"{url_lower} {screen_text.lower()}"

    if any(m in url_lower for m in _MS_ADMIN_CONSENT_HINTS) or "adminconsent" in url_lower:
        return _need_user_action(
            "Microsoft needs your IT admin to approve this app before you can connect."
        )

    if any(m in url_lower for m in _GOOGLE_WARNING_URL_MARKERS) or "hasn't verified" in blob:
        if _history_mentions(history, "advanced") or _history_mentions(history, "unsafe"):
            return _need_user_action(
                "On Google's warning screen: click Advanced, then 'Go to the app (unsafe)', "
                "then Allow access — I'll continue once that's done."
            )
        return _need_user_action(
            "Google shows an unverified-app warning — click Advanced at the bottom left, "
            "then 'Go to the app (unsafe)', then Allow."
        )

    if "notion" in (provider or "").lower():
        return None  # desktop path: let vision handle Notion page picker.

    return None
