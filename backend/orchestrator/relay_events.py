"""A context-scoped event bus for live provider hand-offs (relays).

Relays decided deep inside a tool call (e.g. ``vision_complete`` switching from a
rate-limited Gemini to Claude while ``control_computer`` is running) need to reach
the streaming UI *as they happen*, not only after the tool returns.

This module is the bridge: a request installs a *sink* with ``using_sink`` for the
duration of a tool call, and any code on that call stack (any thread that runs
within the same ``contextvars`` context) emits hand-offs via ``publish``. When no
sink is installed (background/voice paths), ``publish`` is a silent no-op.

Kept tiny and dependency-free on purpose — it's a one-way notification channel, not
a message queue.
"""

from __future__ import annotations

import contextlib
import contextvars
import logging
from typing import Any, Callable, Iterator

logger = logging.getLogger(__name__)

RelaySink = Callable[[dict[str, Any]], None]

_sink: contextvars.ContextVar[RelaySink | None] = contextvars.ContextVar(
    "orchestrator_relay_sink", default=None
)


def publish(event: dict[str, Any]) -> None:
    """Emit a relay event to the active sink, if one is installed (never raises)."""
    sink = _sink.get()
    if sink is None:
        return
    try:
        sink(event)
    except Exception:  # noqa: BLE001 - a UI notification must never break the work
        logger.debug("relay sink raised", exc_info=True)


@contextlib.contextmanager
def using_sink(sink: RelaySink) -> Iterator[None]:
    """Install ``sink`` as the relay receiver for the duration of the block."""
    token = _sink.set(sink)
    try:
        yield
    finally:
        _sink.reset(token)
