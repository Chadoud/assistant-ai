"""Feature flags and URLs for VPS sort-worker."""

from __future__ import annotations

import os

from constants import _env_bool


def cloud_sort_worker_enabled() -> bool:
    """When true, analyze uploads each file to VPS sort-worker (OCR + classify on server)."""
    if _env_bool("EXOSITES_CLOUD_SORT_WORKER", False):
        return True
    mode = (os.environ.get("EXOSITES_SORT_SERVICE_MODE") or "").strip().lower()
    return mode in ("cloud_full", "cloud_worker", "vps")


def cloud_sort_worker_url() -> str:
    raw = (os.environ.get("EXOSITES_CLOUD_SORT_WORKER_URL") or "").strip()
    if raw:
        return raw.rstrip("/")
    host = (os.environ.get("OLLAMA_HOST") or "").strip().rstrip("/")
    if host:
        return f"{host}/v1/sort/worker"
    return ""


def cloud_sort_analyze_file_url() -> str:
    """Full URL for ``POST …/analyze-file`` (base already includes ``/v1/sort/worker``)."""
    base = cloud_sort_worker_url()
    if not base:
        return ""
    return f"{base}/analyze-file"


def sort_worker_auth_header() -> dict[str, str]:
    """Bearer token for sort-worker (same virtual key as LiteLLM when managed)."""
    from llm.ollama_client import _api_key

    key = _api_key()
    if key:
        return {"Authorization": f"Bearer {key}"}
    return {}
