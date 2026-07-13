"""
Gmail “developer setup” checklist — booleans only (no secrets in API responses).
"""

from __future__ import annotations

import re
from typing import Any, Literal

StepStatus = Literal["pass", "fail", "manual", "skipped", "not_applicable"]


def _loopback_redirect_configured(redirect_uri: str) -> bool:
    u = (redirect_uri or "").strip()
    if not u:
        return False
    return bool(
        re.match(
            r"^https?://(127\.0\.0\.1|localhost)(:\d+)?/callback/?$",
            u,
            re.IGNORECASE,
        )
    )


def build_gmail_developer_setup_steps(
    *,
    oauth_configured: bool,
    oauth_env_id_present: bool,
    oauth_env_secret_present: bool,
    backend_dotenv_file_exists: bool,
    user_dotenv_file_exists: bool,
    resource_dotenv_file_exists: bool,
    oauth_json_path_env_present: bool,
    oauth_json_file_at_path_exists: bool,
    oauth_default_json_exists: bool,
    redirect_uri_effective: str,
    gmail_profile_probe_ok: bool | None,
) -> list[dict[str, Any]]:
    """
    Build five checklist rows aligned with in-app developer setup copy.

    ``gmail_profile_probe_ok``: ``True`` / ``False`` after a profile request when
    the user is already connected; ``None`` when not connected (cannot verify API).
    """
    env_both = oauth_env_id_present and oauth_env_secret_present
    json_on_disk = oauth_json_file_at_path_exists or oauth_default_json_exists
    loopback_ok = _loopback_redirect_configured(redirect_uri_effective)

    # Step 1 — client id + secret in env, or JSON path yields credentials (oauth_configured).
    step1: StepStatus = "pass" if oauth_configured else "fail"

    # Step 2 — cannot detect reload; always manual reminder.
    step2: StepStatus = "manual"

    # Step 3 — optional JSON; skipped when env pair is enough; pass when JSON route is used or not needed.
    if env_both and oauth_configured:
        step3: StepStatus = "skipped"
    elif oauth_configured and json_on_disk and not env_both:
        step3 = "pass"
    elif (not oauth_configured) and json_on_disk:
        step3 = "fail"
    else:
        step3 = "not_applicable"

    # Step 4 — local redirect URI shape (Google Cloud registration itself is still manual).
    if not oauth_configured:
        step4: StepStatus = "fail"
    elif loopback_ok:
        step4 = "pass"
    else:
        step4 = "manual"

    # Step 5 — Gmail API reachable when we already have a user session.
    if gmail_profile_probe_ok is True:
        step5: StepStatus = "pass"
    elif gmail_profile_probe_ok is False:
        step5 = "fail"
    else:
        step5 = "manual"

    return [
        {
            "id": "client_credentials",
            "status": step1,
            "hints": {
                "oauth_configured": oauth_configured,
                "oauth_env_id_present": oauth_env_id_present,
                "oauth_env_secret_present": oauth_env_secret_present,
                "backend_dotenv_file_exists": backend_dotenv_file_exists,
                "user_dotenv_file_exists": user_dotenv_file_exists,
                "resource_dotenv_file_exists": resource_dotenv_file_exists,
            },
        },
        {"id": "backend_reload", "status": step2},
        {
            "id": "json_client_file",
            "status": step3,
            "hints": {
                "oauth_json_path_env_present": oauth_json_path_env_present,
                "oauth_json_file_at_path_exists": oauth_json_file_at_path_exists,
                "oauth_default_json_exists": oauth_default_json_exists,
            },
        },
        {
            "id": "redirect_uri",
            "status": step4,
            "hints": {
                "redirect_uri_effective": redirect_uri_effective,
                "loopback_redirect_ok": loopback_ok,
            },
        },
        {
            "id": "gmail_api_enabled",
            "status": step5,
            "hints": {"gmail_profile_probe_ok": gmail_profile_probe_ok},
        },
    ]
