"""
System metrics endpoint — CPU, memory, network, GPU, temperature, uptime, process count.
Polled by the AI Manager left strip every 2 seconds.

Also hosts /integration/token-relay so the Electron main process can push fresh
OAuth access tokens to the backend immediately after connect or token refresh.
"""

from __future__ import annotations

import logging
import platform
import time
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field
from starlette.responses import JSONResponse

logger = logging.getLogger(__name__)

try:
    import psutil
    _PSUTIL = True
except ImportError:
    _PSUTIL = False

router = APIRouter()

# Track previous net counters for KB/s calculation
_prev_net: dict[str, float] = {"bytes": 0.0, "ts": 0.0}


@router.get("/system/metrics")
def system_metrics() -> JSONResponse:
    if not _PSUTIL:
        return JSONResponse({"error": "psutil not installed"}, status_code=503)

    # CPU
    cpu = psutil.cpu_percent(interval=None)

    # Memory
    vm = psutil.virtual_memory()
    mem = vm.percent

    # Network KB/s (total sent + recv delta)
    global _prev_net
    counters = psutil.net_io_counters()
    total_bytes = (counters.bytes_sent + counters.bytes_recv) if counters else 0
    now = time.monotonic()
    elapsed = now - _prev_net["ts"] if _prev_net["ts"] else 1.0
    net_kbps = max(0.0, (total_bytes - _prev_net["bytes"]) / max(elapsed, 0.1) / 1024)
    _prev_net = {"bytes": float(total_bytes), "ts": now}

    # GPU — not available via psutil alone; frontend shows N/A gracefully.
    gpu: float | None = None

    # Temperature — best-effort (Linux: sensors, Windows: WMI not via psutil)
    tmp: float | None = None
    try:
        temps: Any = psutil.sensors_temperatures()  # type: ignore[attr-defined]
        if temps:
            for entries in temps.values():
                for e in entries:
                    if e.current and e.current > 0:
                        tmp = round(e.current, 1)
                        break
                if tmp is not None:
                    break
    except Exception as exc:
        logger.debug("Temperature sensors unavailable: %s", exc)

    # Uptime
    boot = psutil.boot_time()
    up_secs = int(time.time() - boot)
    up_h = up_secs // 3600
    up_m = (up_secs % 3600) // 60
    uptime_str = f"{up_h:02d}:{up_m:02d}"

    # Process count
    proc_count = len(psutil.pids())

    # OS label
    os_label = {"Windows": "WIN", "Darwin": "MAC", "Linux": "LNX"}.get(platform.system(), platform.system()[:3].upper())

    return JSONResponse({
        "cpu": round(cpu, 1),
        "mem": round(mem, 1),
        "net_kbps": round(net_kbps, 1),
        "gpu": gpu,
        "tmp": tmp,
        "uptime": uptime_str,
        "proc": proc_count,
        "os": os_label,
    })


# ── Integration token relay ────────────────────────────────────────────────────

class _TokenRelayBody(BaseModel):
    provider_id: str = Field(..., description="Canonical provider ID, e.g. 'google', 'dropbox'")
    token: str = Field(..., description="OAuth access token")
    expires_in: int = Field(
        default=0,
        description="Token lifetime in seconds. 0 means no expiry tracked.",
    )


@router.post("/integration/token-relay")
def integration_token_relay(body: _TokenRelayBody) -> JSONResponse:
    """
    Accept an OAuth access token pushed by the Electron main process after
    a successful connect or token refresh.

    The token is stored in the in-memory connector credential cache so backend
    connector tools (google_workspace, microsoft_graph, dropbox_files, etc.)
    can retrieve it without an IPC round-trip.
    """
    from connector_credentials import store_token

    if not body.provider_id or not body.token:
        return JSONResponse({"ok": False, "error": "provider_id and token are required"}, status_code=400)

    try:
        store_token(body.provider_id, body.token, body.expires_in)
    except ValueError as exc:
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=400)

    logger.info("[token-relay] stored token for provider=%r", body.provider_id.strip().lower())
    return JSONResponse({"ok": True})


class _WhatsAppEventRelayBody(BaseModel):
    events: list[dict[str, Any]] = Field(default_factory=list)


@router.post("/integration/whatsapp-events-relay")
def whatsapp_events_relay(body: _WhatsAppEventRelayBody) -> JSONResponse:
    """
    Accept WhatsApp webhook events polled from cloud-node by the Electron main process.
    Stored in-memory for session-window checks and recent-message context.
    """
    from whatsapp_event_store import ingest_events

    count = ingest_events(body.events)
    return JSONResponse({"ok": True, "ingested": count})


@router.get("/integration/whatsapp-health")
def whatsapp_health() -> JSONResponse:
    """Recent webhook-derived events for External sources health UI."""
    from whatsapp_event_store import recent_events

    rows = recent_events(limit=100)
    inbound = [row for row in rows if row.get("event_type") == "message"]
    last_inbound_ms = None
    if inbound:
        ts = inbound[0].get("meta_timestamp_ms") or inbound[0].get("created_at_ms")
        if isinstance(ts, int):
            last_inbound_ms = ts
    return JSONResponse(
        {
            "ok": True,
            "inbound_count": len(inbound),
            "last_inbound_ms": last_inbound_ms,
        }
    )


# ── Dev-only runtime env (Electron managed sort credentials hot-patch) ─────────

class _RuntimeEnvBody(BaseModel):
    values: dict[str, str] = Field(default_factory=dict)


@router.post("/dev/runtime-env")
def dev_runtime_env(body: _RuntimeEnvBody) -> JSONResponse:
    """
    Apply env vars to the running process without restart (dev smoke tests only).

    Disabled unless EXOSITES_DEV_BYPASS_ENTITLEMENT=1 (set by Electron in dev).
    """
    import os

    if os.environ.get("EXOSITES_DEV_BYPASS_ENTITLEMENT", "").strip() not in ("1", "true", "yes"):
        return JSONResponse({"ok": False, "error": "dev_only"}, status_code=404)

    allowed_prefixes = ("OLLAMA_", "EXOSITES_REMOTE_LLM", "EXOSITES_SORT_")
    applied: list[str] = []
    for key, value in body.values.items():
        if not any(key.startswith(p) for p in allowed_prefixes):
            continue
        os.environ[key] = str(value)
        applied.append(key)

    return JSONResponse({"ok": True, "applied": applied})
