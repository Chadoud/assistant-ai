"""
Voice/agent tool: validates Google OAuth for Drive workspace sort, delegates execution to Electron UI.

Imports from Drive + progressive classify reuse the Queue panel workspace batch (`forceGoogleDrive`).
"""

from __future__ import annotations

import logging
from typing import Any

from connector_credentials import CredentialUnavailableError, try_get_token

logger = logging.getLogger(__name__)


def run_google_drive_workspace_sort(parameters: dict[str, Any]) -> dict[str, Any]:
    """
    Parameters: none required (reserved for language / scopes).

    Ensures a Google connector token is available (Drive or shared Google session);
    Electron runs the progressive Drive workspace import matching the Sort tab.
    """
    try:
        try_get_token("google-drive", "google", "google-gmail")
    except CredentialUnavailableError as exc:
        logger.info("[tool] run_google_drive_workspace_sort no token: %s", exc)
        return {"ok": False, "error": str(exc)}
    return {
        "ok": True,
        "data": {
            "delegated_frontend_action": "run_workspace_batch",
            "force_google_drive": True,
        },
    }
