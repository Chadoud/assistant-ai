"""WebSocket app-token authentication for /ws/voice."""

from __future__ import annotations

import asyncio
import json
import logging

from fastapi import WebSocket
from starlette.websockets import WebSocketDisconnect

from app_auth import app_token_auth_enabled, validate_app_token

logger = logging.getLogger(__name__)

AUTH_MESSAGE_TIMEOUT_S = 5.0


async def authenticate_voice_websocket(ws: WebSocket, query_token: str | None) -> bool:
    """
    Validate the per-run app token for a voice WebSocket.

    Accepts, in order:
    1. ``X-App-Token`` header (tests / non-browser clients)
    2. ``?token=`` query param (legacy — avoid in new clients; may appear in logs)
    3. First JSON frame ``{"type":"app_auth","token":"..."}`` within 5s (preferred)
    """
    if not app_token_auth_enabled():
        return True

    header_token = ws.headers.get("x-app-token") or ws.headers.get("X-App-Token")
    if validate_app_token(query_token or header_token):
        return True

    try:
        raw = await asyncio.wait_for(ws.receive_text(), timeout=AUTH_MESSAGE_TIMEOUT_S)
        data = json.loads(raw)
        if isinstance(data, dict) and data.get("type") == "app_auth":
            token = str(data.get("token") or "").strip()
            return validate_app_token(token)
    except asyncio.TimeoutError:
        logger.debug("voice WS auth timed out waiting for app_auth frame")
    except WebSocketDisconnect:
        logger.debug("voice WS auth client disconnected before app_auth")
    except (json.JSONDecodeError, TypeError, ValueError):
        logger.debug("voice WS auth received invalid app_auth payload")

    return False
