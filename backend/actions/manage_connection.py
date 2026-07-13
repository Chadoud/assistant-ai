"""Connect or disconnect an external-source account on the user's behalf.

The OAuth flow and encrypted token storage live in the Electron main process,
not the Python backend, so this tool cannot perform the connect/disconnect
itself. Instead it validates the request and returns a ``client_action`` that
the desktop renderer executes via ``window.electronAPI.integrationConnect`` /
``integrationDisconnect`` (mirrors the ``stop_voice`` action pattern).
"""

from __future__ import annotations

import logging
from typing import Any

from actions.connect_orchestrator import prepare_connect_context

logger = logging.getLogger(__name__)

# Spoken / typed provider names → Electron provider id (see integrationCore.js).
# Keys are matched case-insensitively against a normalised request string.
_PROVIDER_ALIASES: dict[str, str] = {
    "gmail": "google-gmail",
    "google mail": "google-gmail",
    "google email": "google-gmail",
    "google drive": "google-drive",
    "drive": "google-drive",
    "google calendar": "google-calendar",
    "google agenda": "google-calendar",
    "google all": "google-all",
    "google account": "google-all",
    "google": "google-all",
    "microsoft": "microsoft",
    "outlook": "microsoft",
    "office": "microsoft",
    "office 365": "microsoft",
    "onedrive": "microsoft",
    "one drive": "microsoft",
    "notion": "notion",
    "dropbox": "dropbox",
    "slack": "slack",
    "whatsapp": "whatsapp",
    "infomaniak calendar": "infomaniak-calendar",
    "infomaniak agenda": "infomaniak-calendar",
    "infomaniak": "infomaniak",
    "kdrive": "infomaniak",
}

# Human-readable label per provider id, for the spoken confirmation.
_PROVIDER_LABELS: dict[str, str] = {
    "google-gmail": "Gmail",
    "google-drive": "Google Drive",
    "google-calendar": "Google Calendar",
    "google-all": "Google",
    "microsoft": "Microsoft",
    "notion": "Notion",
    "dropbox": "Dropbox",
    "slack": "Slack",
    "whatsapp": "WhatsApp",
    "infomaniak": "Infomaniak",
    "infomaniak-calendar": "Infomaniak Calendar",
}

_VALID_OPERATIONS = ("connect", "disconnect")


def _resolve_provider_id(raw: str, *, missing_scope: str = "") -> str | None:
    """Map a free-form provider name to a known Electron provider id."""
    scope = " ".join(missing_scope.lower().split())
    if scope in ("calendar", "google-calendar", "google calendar"):
        return "google-calendar"
    if scope in ("gmail", "google-gmail", "mail", "email"):
        return "google-gmail"
    if scope in ("drive", "google-drive", "google drive"):
        return "google-drive"

    needle = " ".join(raw.lower().split())
    if not needle:
        return None
    if needle in _PROVIDER_ALIASES:
        return _PROVIDER_ALIASES[needle]
    # Prefer calendar over google-all when the user names calendar explicitly.
    if "calendar" in needle or "agenda" in needle:
        return "google-calendar"
    # Fall back to substring containment (e.g. "my gmail account" → gmail).
    for alias, provider_id in _PROVIDER_ALIASES.items():
        if alias in needle:
            return provider_id
    return None


def manage_connection(parameters: dict[str, Any]) -> dict[str, Any]:
    """Connect/disconnect an external source. Returns a client_action for the renderer.

    :param parameters: ``operation`` ("connect"|"disconnect") and ``provider``
        (free-form name like "Gmail", "Google Drive", "Notion", "Outlook").
    :returns: ``{ok, data: {action, provider_id, provider_label}}`` or an error.
    """
    operation = str(parameters.get("operation", "")).strip().lower()
    provider_raw = str(parameters.get("provider", "")).strip()
    missing_scope = str(parameters.get("missing_scope", "")).strip()

    if operation not in _VALID_OPERATIONS:
        return {
            "ok": False,
            "error": f"operation must be one of {list(_VALID_OPERATIONS)}.",
        }

    provider_id = _resolve_provider_id(provider_raw, missing_scope=missing_scope)
    if provider_id is None:
        return {
            "ok": False,
            "error": (
                f"I don't recognise the service {provider_raw!r}. Supported: Gmail, "
                "Google Drive, Google Calendar, Microsoft/Outlook/OneDrive, Notion, "
                "Dropbox, Slack, WhatsApp, Infomaniak."
            ),
        }

    label = _PROVIDER_LABELS.get(provider_id, provider_id)

    if operation == "connect" and provider_id == "whatsapp":
        logger.info("[action] manage_connection connect provider=whatsapp → open_whatsapp_setup")
        return {
            "ok": True,
            "data": {
                "action": "open_whatsapp_setup",
                "provider_id": provider_id,
                "provider_label": label,
            },
            "hint": (
                "Opening External sources → WhatsApp setup for Business Cloud API. "
                "Personal WhatsApp already works via send_message on the desktop app — "
                "no OAuth needed for contact names. Say one short sentence that you're "
                "opening the setup guide, then wait for the user to finish or skip."
            ),
        }

    action = "integration_connect" if operation == "connect" else "integration_disconnect"
    logger.info("[action] manage_connection %s provider=%s", operation, provider_id)

    connect_context = (
        prepare_connect_context(provider_id, label) if operation == "connect" else None
    )

    if operation == "connect":
        hint = (
            f"Opening {label} and driving the authorization in Chrome for the user. "
            "Electron autopilot clicks through the consent screen automatically — do not use "
            "screen-control tools for OAuth. Say one short sentence that you're connecting it, then "
            "wait for the client connect result. Only claim success when verification confirms "
            "the scopes needed; if autopilot needs the user (password/2FA/captcha or unverified-app "
            "handoff), tell them exactly what to click — e.g. Advanced, then 'Go to app (unsafe)', "
            "then Allow."
        )
        if connect_context and connect_context.get("prior_failures"):
            hint += " Prior connect failures are noted — avoid repeating the same dead-end clicks."
    else:
        hint = f"{label} has been disconnected."

    data: dict[str, Any] = {
        "action": action,
        "provider_id": provider_id,
        "provider_label": label,
    }
    if connect_context is not None:
        data["connect_id"] = connect_context["connect_id"]
        data["seed_history"] = connect_context.get("seed_history") or []

    return {
        "ok": True,
        "data": data,
        "hint": hint,
    }
