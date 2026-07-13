"""World model — a small, current snapshot of what the agent knows about its context.

Proactive initiative needs grounding: instead of guessing, the agent reads a snapshot
assembled from registered *observers* (each a function returning facts). Observers are
pluggable so callers can add real signals (connected accounts, open files, calendar)
without this module depending on the whole app. Two default observers expose the
agent's own recent episodic memory and audit trail.
"""

from __future__ import annotations

import logging
from typing import Any, Callable

from . import audit, memory

logger = logging.getLogger(__name__)

ObserverFn = Callable[[], dict[str, Any]]

_observers: dict[str, ObserverFn] = {}


def register_observer(name: str, fn: ObserverFn) -> None:
    """Register (or replace) a named observer producing a facts dict."""
    _observers[name] = fn


def _recent_failures() -> dict[str, Any]:
    failures = memory.recent(5, kinds=[memory.KIND_FAILURE])
    return {"recent_failures": [f.content[:200] for f in failures]}


def _recent_actions() -> dict[str, Any]:
    entries = audit.recent_actions(10)
    return {"recent_actions": [f"{e.action} → {e.outcome}" for e in entries]}


register_observer("memory", _recent_failures)
register_observer("audit", _recent_actions)


def snapshot() -> dict[str, Any]:
    """Collect facts from every observer, isolating failures so one can't break the rest."""
    out: dict[str, Any] = {}
    for name, fn in _observers.items():
        try:
            out[name] = fn()
        except Exception as exc:  # noqa: BLE001
            logger.warning("observer %s failed: %s", name, exc)
            out[name] = {"error": str(exc)}
    return out


def render(snap: dict[str, Any] | None = None) -> str:
    """Compact, human-readable view of the current world snapshot."""
    snap = snapshot() if snap is None else snap
    lines: list[str] = []
    for name, facts in snap.items():
        for key, value in (facts or {}).items():
            lines.append(f"{name}.{key}: {value}")
    return "\n".join(lines)
