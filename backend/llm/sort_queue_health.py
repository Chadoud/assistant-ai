"""Probe the optional VPS Redis sort inference queue."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import httpx

from llm.ollama_client import is_remote_mode, sort_queue_enabled


def _queue_url_from_overrides() -> str:
    ud = (os.environ.get("EXOSITES_USER_DATA") or "").strip()
    if ud:
        path = Path(ud) / "backend-env-overrides.json"
        if path.is_file():
            try:
                import json

                raw = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(raw, dict):
                    url = str(raw.get("EXOSITES_SORT_QUEUE_URL") or "").strip()
                    if url:
                        return url.rstrip("/")
            except (OSError, ValueError, TypeError):
                pass
    return (os.environ.get("EXOSITES_SORT_QUEUE_URL") or "").strip().rstrip("/")


def check_sort_queue_health(*, timeout_s: float = 5.0) -> dict[str, Any]:
    """
    GET ``/health`` on the sort queue when configured.

    Returns ``{ok, detail, ...}``. When queue is disabled, returns ok with detail disabled.
    """
    if not is_remote_mode() or not sort_queue_enabled():
        url = _queue_url_from_overrides()
        if not url:
            return {"ok": True, "detail": "disabled", "enabled": False}
    url = _queue_url_from_overrides()
    if not url:
        return {"ok": True, "detail": "disabled", "enabled": False}

    try:
        health_path = f"{url.rstrip('/')}/v1/sort/queue/health"
        with httpx.Client(timeout=timeout_s) as client:
            response = client.get(health_path)
        if response.status_code != 200:
            return {
                "ok": False,
                "enabled": True,
                "detail": f"status_{response.status_code}",
                "url": url,
            }
        payload = response.json() if response.content else {}
        if not isinstance(payload, dict):
            payload = {}
        overloaded = bool(payload.get("overloaded"))
        return {
            "ok": bool(payload.get("ok", True)) and not overloaded,
            "enabled": True,
            "detail": "overloaded" if overloaded else "reachable",
            "url": url,
            "pending_jobs": payload.get("pending_jobs"),
            "workers": payload.get("workers"),
        }
    except Exception as exc:
        return {
            "ok": False,
            "enabled": True,
            "detail": type(exc).__name__,
            "url": url,
        }
