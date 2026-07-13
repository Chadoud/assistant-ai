"""
Per voice WebSocket session: defer startup briefing until the user consents.

The gate is registered for the lifetime of one /ws/voice connection so the
run_startup_briefing tool can start the briefing pipeline from a tool thread.
"""

from __future__ import annotations

import asyncio
import logging
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Awaitable, Callable

logger = logging.getLogger(__name__)

BriefingPipelineStarter = Callable[[], Awaitable[None]]


@dataclass
class VoiceBriefingGate:
    """Starts the briefing pipeline at most once per voice session."""

    _starter: BriefingPipelineStarter | None = None
    _task: asyncio.Task[None] | None = None
    _loop: asyncio.AbstractEventLoop | None = None

    def configure(self, starter: BriefingPipelineStarter) -> None:
        """Bind the async starter for this WebSocket session."""
        self._starter = starter
        self._loop = asyncio.get_running_loop()

    def clear(self) -> None:
        """Drop references when the voice WebSocket closes."""
        self._starter = None
        self._loop = None
        self._task = None

    def start_from_tool_thread(self) -> dict:
        """
        Schedule the briefing pipeline on the voice event loop.

        @returns Tool-style {ok, data|error} dict.
        """
        if not self._starter or not self._loop:
            return {
                "ok": False,
                "error": "No startup briefing is available in this voice session.",
            }
        if self._task is not None and not self._task.done():
            return {"ok": True, "data": {"started": False, "already_running": True}}

        def _schedule() -> None:
            if self._task is not None and not self._task.done():
                return
            if not self._starter:
                return

            async def _run() -> None:
                try:
                    await self._starter()
                except asyncio.CancelledError:
                    raise
                except Exception:
                    logger.exception("[briefing] deferred pipeline failed")

            self._task = asyncio.create_task(_run(), name="briefing_pipeline_deferred")

        self._loop.call_soon_threadsafe(_schedule)
        return {"ok": True, "data": {"started": True}}


_voice_briefing_gate: ContextVar[VoiceBriefingGate | None] = ContextVar(
    "voice_briefing_gate",
    default=None,
)


def get_voice_briefing_gate() -> VoiceBriefingGate | None:
    """Return the gate for the active voice WebSocket, if any."""
    return _voice_briefing_gate.get()


def bind_voice_briefing_gate(gate: VoiceBriefingGate) -> None:
    """Register the gate for the current async context (one voice WS)."""
    _voice_briefing_gate.set(gate)


def clear_voice_briefing_gate() -> None:
    """Clear the gate when the voice WebSocket closes."""
    _voice_briefing_gate.set(None)
