"""
LLM admission and analyze concurrency alignment for centralized inference.

In remote mode, ``EXOSITES_LLM_MAX_SLOTS`` caps concurrent chat/embed calls to LiteLLM
and also caps ``EXOSITES_SORT_MAX_CONCURRENCY`` so the desktop does not oversubscribe
the shared server.
"""

from __future__ import annotations

from typing import Any

from constants import _env_int
from llm.ollama_client import is_remote_mode, sort_queue_enabled


def _configured_sort_max_concurrency() -> int:
    raw = _env_int("EXOSITES_SORT_MAX_CONCURRENCY", 1)
    return max(1, min(8, raw))


def llm_max_slots() -> int:
    """Server-side concurrent LLM calls allowed (0 = no client-side cap)."""
    return max(0, _env_int("EXOSITES_LLM_MAX_SLOTS", 0))


def effective_sort_max_concurrency() -> int:
    """
    Parallel analyze workers for batch and streaming jobs.

    Local mode uses ``EXOSITES_SORT_MAX_CONCURRENCY`` only.
    Remote mode uses ``min(sort_concurrency, llm_max_slots)`` when slots are configured.
    """
    base = _configured_sort_max_concurrency()
    if not is_remote_mode():
        return base
    slots = llm_max_slots()
    if slots <= 0:
        return base
    return max(1, min(base, slots))


def admission_summary() -> dict[str, Any]:
    """Diagnostics for ``GET /ready`` and ops tooling."""
    remote = is_remote_mode()
    slots = llm_max_slots()
    sort_cap = effective_sort_max_concurrency()
    return {
        "remote": remote,
        "llm_max_slots": slots,
        "sort_max_concurrency_configured": _configured_sort_max_concurrency(),
        "sort_max_concurrency_effective": sort_cap,
        "slot_limiting_enabled": remote and slots > 0,
        "sort_queue_enabled": remote and sort_queue_enabled(),
    }
