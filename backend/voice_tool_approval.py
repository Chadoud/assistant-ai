"""Per-voice-session approval futures for sensitive tools (screen, codegen)."""

from __future__ import annotations

import asyncio
import logging
import time

logger = logging.getLogger(__name__)

DEFAULT_SCREEN_CAPTURE_SESSION_SEC = 900.0


class VoiceToolApprovalWaiter:
    """Maps Gemini tool call IDs to Futures resolved when the UI approves or denies."""

    def __init__(self) -> None:
        self._pending: dict[str, asyncio.Future[bool]] = {}
        self._screen_capture_until: float = 0.0

    def grant_screen_capture_session(self, ttl_seconds: float = DEFAULT_SCREEN_CAPTURE_SESSION_SEC) -> None:
        """After explicit UI consent for repeated screen capture until TTL."""
        self._screen_capture_until = time.monotonic() + max(60.0, ttl_seconds)

    def screen_capture_session_active(self) -> bool:
        return time.monotonic() < self._screen_capture_until

    def prepare(self, call_id: str) -> asyncio.Future[bool]:
        """Register a Future before emitting tool_approval_required (avoids approve racing wait)."""
        loop = asyncio.get_running_loop()
        fut = loop.create_future()
        self._pending[call_id] = fut
        return fut

    def resolve(self, call_id: str, approved: bool) -> None:
        fut = self._pending.pop(call_id, None)
        if fut is None:
            logger.warning("No pending approval for call_id=%s", call_id)
            return
        if not fut.done():
            fut.set_result(approved)

    def deny_all(self) -> None:
        """Unblock every waiter (task cancel / session teardown)."""
        for call_id in list(self._pending):
            self.resolve(call_id, False)

    async def wait_for_decision(self, call_id: str, timeout_sec: float = 120.0) -> bool:
        """Wait for resolve(); prefer prepare() + wait on returned Future for Live tools."""
        loop = asyncio.get_running_loop()
        fut = loop.create_future()
        self._pending[call_id] = fut
        try:
            return await asyncio.wait_for(fut, timeout=timeout_sec)
        except asyncio.TimeoutError:
            logger.warning("Tool approval timed out call_id=%s", call_id)
            return False
        finally:
            self._pending.pop(call_id, None)
