"""Tests for Gemini Live audio queue forwarding."""

import asyncio
from unittest.mock import AsyncMock, MagicMock

from voice.audio_pipeline import AudioSendLoopState, run_incoming_audio_send_loop


def test_ptt_end_does_not_send_activity_end():
    """PTT must not send ActivityEnd — it breaks automatic activity detection (WS 1007)."""

    async def _run() -> None:
        queue: asyncio.Queue[bytes | str | None] = asyncio.Queue()
        await queue.put("[PTT_END]")
        await queue.put(None)

        session = MagicMock()
        session.send_realtime_input = AsyncMock()
        session.send_client_content = AsyncMock()
        genai_types = MagicMock()

        state = AudioSendLoopState()
        await run_incoming_audio_send_loop(queue, session, genai_types, state)

        session.send_realtime_input.assert_not_called()
        assert state.stopped_explicitly is True

    asyncio.run(_run())
