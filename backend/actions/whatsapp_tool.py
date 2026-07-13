"""
WhatsApp Business Cloud API — assistant connector.

Credentials arrive via connector_credentials (token relay from Electron) as JSON:
  { "phone_number_id", "access_token", "business_account_id"? }

Personal WhatsApp (contact names, desktop app) stays on send_message — not this module.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

import httpx

from connector_credentials import CredentialUnavailableError, try_get_token
from whatsapp_event_store import delivery_status, recent_events, session_check

logger = logging.getLogger(__name__)

GRAPH_API_VERSION = "v21.0"
GRAPH_API_BASE = f"https://graph.facebook.com/{GRAPH_API_VERSION}"
MAX_MESSAGE_LEN = 4096


def normalize_recipient_e164(recipient: str) -> str | None:
    """Strip to digits-only E.164 body (no leading +)."""
    digits = re.sub(r"\D", "", recipient or "")
    if len(digits) < 8:
        return None
    return digits


def _friendly_whatsapp_error(raw: str) -> str:
    """Map Meta Graph errors to actionable user-facing messages."""
    lower = raw.lower()
    if "131026" in raw or "template" in lower and "required" in lower:
        return (
            "WhatsApp requires an approved template for this recipient. "
            "Use send_template with an approved template name, or message them via "
            "WhatsApp on your computer (contact name)."
        )
    if "131047" in raw or "re-engagement" in lower or "24 hour" in lower:
        return (
            "Outside WhatsApp's 24-hour reply window — use an approved template "
            "or message via the desktop app."
        )
    if "100" in raw and "invalid" in lower:
        return "Invalid phone number — include country code (e.g. +41791234567)."
    if "190" in raw or "invalid oauth" in lower or "access token" in lower:
        return (
            "WhatsApp Business API credentials expired or invalid. "
            "Update them under External sources → WhatsApp."
        )
    if "cloud_api_not_configured" in lower or "not configured" in lower:
        return (
            "WhatsApp Business API is not set up. Open External sources → WhatsApp → "
            "Set up Business API, or message via the desktop app."
        )
    return raw


def _parse_credentials_token(token: str) -> dict[str, str]:
    try:
        raw = json.loads(token)
    except json.JSONDecodeError as exc:
        raise CredentialUnavailableError(
            "WhatsApp credentials are misconfigured. Re-enter them in External sources → WhatsApp."
        ) from exc
    if not isinstance(raw, dict):
        raise CredentialUnavailableError("WhatsApp credentials are invalid.")
    phone_number_id = str(raw.get("phone_number_id", "")).strip()
    access_token = str(raw.get("access_token", "")).strip()
    if not phone_number_id or not access_token:
        raise CredentialUnavailableError(
            "WhatsApp Business API is not connected. Set it up under External sources → WhatsApp."
        )
    return {
        "phone_number_id": phone_number_id,
        "access_token": access_token,
        "business_account_id": str(raw.get("business_account_id", "")).strip(),
    }


def load_whatsapp_config() -> dict[str, str] | None:
    """Load Cloud API config from connector_credentials (token relay)."""
    try:
        return _parse_credentials_token(try_get_token("whatsapp"))
    except CredentialUnavailableError:
        return None


def _credentials() -> dict[str, str]:
    cfg = load_whatsapp_config()
    if not cfg:
        raise CredentialUnavailableError(
            "WhatsApp Business API is not connected. Set it up under External sources → WhatsApp."
        )
    return cfg


def _headers(access_token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }


def _graph_post(cfg: dict[str, str], path: str, body: dict[str, Any]) -> dict[str, Any]:
    url = f"{GRAPH_API_BASE}/{path.lstrip('/')}"
    res = httpx.post(url, headers=_headers(cfg["access_token"]), json=body, timeout=30)
    data = res.json() if res.content else {}
    if res.status_code >= 400:
        msg = ""
        if isinstance(data.get("error"), dict):
            err = data["error"]
            code = err.get("code")
            message = err.get("message", "")
            msg = f"({code}) {message}" if code else str(message)
        if not msg:
            msg = f"HTTP {res.status_code}"
        raise RuntimeError(_friendly_whatsapp_error(msg))
    return data if isinstance(data, dict) else {}


def _graph_get(cfg: dict[str, str], path: str, params: dict[str, str] | None = None) -> dict[str, Any]:
    url = f"{GRAPH_API_BASE}/{path.lstrip('/')}"
    res = httpx.get(
        url,
        headers=_headers(cfg["access_token"]),
        params=params or {},
        timeout=15,
    )
    data = res.json() if res.content else {}
    if res.status_code >= 400:
        msg = ""
        if isinstance(data.get("error"), dict):
            err = data["error"]
            msg = str(err.get("message") or err.get("code") or res.status_code)
        if not msg:
            msg = f"HTTP {res.status_code}"
        raise RuntimeError(_friendly_whatsapp_error(msg))
    return data if isinstance(data, dict) else {}


def try_send_whatsapp_cloud(recipient: str, message_text: str) -> tuple[bool, str | None, dict[str, Any] | None]:
    """
    Send free-text via Cloud API when configured.

    Returns (ok, error_reason, data) where data may include message_id on success.
    """
    try:
        cfg = _credentials()
    except CredentialUnavailableError:
        return False, "cloud_api_not_configured", None

    to = normalize_recipient_e164(recipient)
    if not to:
        return False, "cloud_api_needs_phone_number", None
    text = (message_text or "")[:MAX_MESSAGE_LEN]
    if not text:
        return False, "empty_message", None

    try:
        data = _graph_post(
            cfg,
            f"{cfg['phone_number_id']}/messages",
            {
                "messaging_product": "whatsapp",
                "to": to,
                "type": "text",
                "text": {"body": text},
            },
        )
        message_id = None
        messages = data.get("messages")
        if isinstance(messages, list) and messages and isinstance(messages[0], dict):
            message_id = messages[0].get("id")
        return True, None, {"message_id": message_id, "to": to}
    except RuntimeError as exc:
        return False, str(exc), None
    except Exception as exc:
        logger.info("whatsapp cloud send failed: %s", exc)
        return False, str(exc), None


def _connection_status(_params: dict[str, Any]) -> dict[str, Any]:
    cfg = load_whatsapp_config()
    if not cfg:
        return {
            "ok": True,
            "data": {
                "business_api_configured": False,
                "personal_desktop_hint": (
                    "Message contacts by name via send_message — opens WhatsApp on your computer."
                ),
            },
        }
    display_phone = None
    try:
        profile = _graph_get(
            cfg,
            cfg["phone_number_id"],
            {"fields": "display_phone_number,verified_name"},
        )
        display_phone = profile.get("display_phone_number")
    except Exception as exc:
        logger.debug("whatsapp connection_status profile fetch: %s", exc)
    inbound = recent_events(limit=1, event_type="message")
    return {
        "ok": True,
        "data": {
            "business_api_configured": True,
            "display_phone_number": display_phone,
            "webhook_events_cached": len(inbound) > 0,
            "personal_desktop_hint": (
                "Phone numbers use Business API; contact names use send_message on desktop."
            ),
        },
    }


def _send_text(params: dict[str, Any]) -> dict[str, Any]:
    to = str(params.get("to", params.get("recipient", ""))).strip()
    text = str(params.get("text", params.get("message_text", ""))).strip()
    if not to or not text:
        return {"ok": False, "error": "to and text are required (phone number with country code)"}

    session = session_check(to)
    if not session.open and not params.get("force"):
        return {
            "ok": False,
            "error": session.reason,
            "data": {
                "session_open": False,
                "last_inbound_ms": session.last_inbound_ms,
                "hint": "Call send_template with an approved template, or use send_message for desktop WhatsApp.",
            },
        }

    ok, err, data = try_send_whatsapp_cloud(to, text)
    if not ok:
        return {"ok": False, "error": _friendly_whatsapp_error(err or "send_failed")}
    return {
        "ok": True,
        "data": {
            "method": "whatsapp_cloud_api",
            "session_open": session.open,
            **(data or {}),
            "hint": "Message sent via WhatsApp Business API.",
        },
    }


def _send_template(params: dict[str, Any]) -> dict[str, Any]:
    cfg = _credentials()
    to = str(params.get("to", params.get("recipient", ""))).strip()
    template_name = str(params.get("template_name", "")).strip()
    language_code = str(params.get("language_code", "en")).strip() or "en"
    if not to or not template_name:
        return {"ok": False, "error": "to and template_name are required"}

    digits = normalize_recipient_e164(to)
    if not digits:
        return {"ok": False, "error": "to must be a phone number with country code"}

    template_body: dict[str, Any] = {
        "name": template_name,
        "language": {"code": language_code},
    }
    components = params.get("components")
    if components:
        template_body["components"] = components

    try:
        data = _graph_post(
            cfg,
            f"{cfg['phone_number_id']}/messages",
            {
                "messaging_product": "whatsapp",
                "to": digits,
                "type": "template",
                "template": template_body,
            },
        )
        message_id = None
        messages = data.get("messages")
        if isinstance(messages, list) and messages and isinstance(messages[0], dict):
            message_id = messages[0].get("id")
        return {
            "ok": True,
            "data": {
                "method": "whatsapp_cloud_api",
                "message_id": message_id,
                "to": digits,
                "template_name": template_name,
            },
        }
    except RuntimeError as exc:
        return {"ok": False, "error": str(exc)}


def _list_templates(params: dict[str, Any]) -> dict[str, Any]:
    cfg = _credentials()
    waba_id = str(params.get("waba_id", cfg.get("business_account_id", ""))).strip()
    if not waba_id:
        return {
            "ok": False,
            "error": "WhatsApp Business Account ID is required. Add it in External sources → WhatsApp setup.",
        }
    limit = min(int(params.get("limit", 50)), 100)
    data = _graph_get(cfg, f"{waba_id}/message_templates", {"limit": str(limit)})
    templates = []
    for row in data.get("data", []) if isinstance(data.get("data"), list) else []:
        if not isinstance(row, dict):
            continue
        templates.append(
            {
                "name": row.get("name"),
                "language": row.get("language"),
                "status": row.get("status"),
                "category": row.get("category"),
            }
        )
    return {"ok": True, "data": {"templates": templates, "count": len(templates)}}


def _list_recent_messages(params: dict[str, Any]) -> dict[str, Any]:
    limit = min(int(params.get("limit", 20)), 100)
    event_type = str(params.get("event_type", "")).strip() or None
    rows = recent_events(limit=limit, event_type=event_type)
    return {"ok": True, "data": {"messages": rows, "count": len(rows)}}


def _get_delivery_status(params: dict[str, Any]) -> dict[str, Any]:
    wa_message_id = str(params.get("wa_message_id", params.get("message_id", ""))).strip()
    if not wa_message_id:
        return {"ok": False, "error": "wa_message_id is required"}
    row = delivery_status(wa_message_id)
    if not row:
        return {
            "ok": True,
            "data": {
                "wa_message_id": wa_message_id,
                "status": None,
                "hint": "No delivery status yet — enable webhooks and wait for the next poll.",
            },
        }
    return {
        "ok": True,
        "data": {
            "wa_message_id": wa_message_id,
            "status": row.get("status"),
            "to_e164": row.get("to_e164"),
            "meta_timestamp_ms": row.get("meta_timestamp_ms"),
        },
    }


def _check_session(params: dict[str, Any]) -> dict[str, Any]:
    to = str(params.get("to", params.get("recipient", ""))).strip()
    if not to:
        return {"ok": False, "error": "to is required (phone number with country code)"}
    check = session_check(to)
    return {
        "ok": True,
        "data": {
            "to": normalize_recipient_e164(to),
            "session_open": check.open,
            "last_inbound_ms": check.last_inbound_ms,
            "reason": check.reason,
        },
    }


_OPERATIONS: dict[str, Any] = {
    "connection_status": _connection_status,
    "send_text": _send_text,
    "send_template": _send_template,
    "list_templates": _list_templates,
    "list_recent_messages": _list_recent_messages,
    "get_delivery_status": _get_delivery_status,
    "check_session": _check_session,
}


def whatsapp_messaging(parameters: dict[str, Any]) -> dict[str, Any]:
    """
    WhatsApp Business Cloud API.

    Parameters:
        operation: connection_status | send_text | send_template | list_templates |
            list_recent_messages | get_delivery_status | check_session
    """
    logger.debug("[action] whatsapp_messaging called args=%r", parameters)
    operation = str(parameters.get("operation", "")).strip()
    if not operation:
        return {
            "ok": False,
            "error": f"operation is required. Available: {sorted(_OPERATIONS)}",
        }
    handler = _OPERATIONS.get(operation)
    if handler is None:
        return {
            "ok": False,
            "error": f"Unknown operation {operation!r}. Available: {sorted(_OPERATIONS)}",
        }
    try:
        return handler(parameters)
    except CredentialUnavailableError as exc:
        return {"ok": False, "error": str(exc)}
    except RuntimeError as exc:
        return {"ok": False, "error": str(exc)}
    except httpx.HTTPStatusError as exc:
        snippet = exc.response.text[:300]
        return {"ok": False, "error": f"WhatsApp HTTP error {exc.response.status_code}: {snippet}"}
    except Exception as exc:
        logger.exception("[whatsapp_messaging] unexpected error operation=%r", operation)
        return {"ok": False, "error": str(exc)}
