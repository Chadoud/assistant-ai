"""Structured HTTP request logging with optional correlation id."""

from __future__ import annotations

import json
import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from request_context import clear_request_id, set_request_id

logger = logging.getLogger("exo.http")

_REQUEST_ID_HEADER = "X-Request-Id"

# High-frequency polls and routine reads — log at DEBUG so dev terminals stay readable.
_QUIET_PATHS = frozenset({
    "/health",
    "/ready",
    "/voice/status",
    "/nudges",
    "/memory",
    "/tasks",
    "/proactive/failures",
    "/digest/latest",
    "/gmail/status",
    "/models",
    "/folder-tree",
    "/conversations/search",
    "/v1/public/client-config",
    "/v1/telemetry/events",
})


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Emit one JSON log line per request with duration and status."""

    async def dispatch(self, request: Request, call_next) -> Response:  # type: ignore[override]
        request_id = (request.headers.get(_REQUEST_ID_HEADER) or "").strip() or uuid.uuid4().hex
        set_request_id(request_id)
        started = time.perf_counter()
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            response.headers[_REQUEST_ID_HEADER] = request_id
            return response
        finally:
            duration_ms = round((time.perf_counter() - started) * 1000, 2)
            payload = {
                "event": "http_request",
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status": status_code,
                "duration_ms": duration_ms,
            }
            line = json.dumps(payload, separators=(",", ":"))
            if request.url.path in _QUIET_PATHS:
                logger.debug("%s", line)
            else:
                logger.info("%s", line)
            clear_request_id()
