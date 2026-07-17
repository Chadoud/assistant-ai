"""
Real-time voice session backed by the Google Gemini Live API.

Ported from Mark-XXXIX's ExoLive class and adapted for FastAPI WebSocket delivery.

Data flow:
  Browser AudioWorklet  →  binary PCM (16 kHz, int16, mono)
     → WebSocket /ws/voice
       → run_voice_session  →  Gemini Live API
  Gemini Live API  →  audio_out / transcript events / tool calls
     → WebSocket client (JSON frames)

Tool calling:
  Gemini emits LiveServerToolCall → handlers run via tool_registry.dispatch_sync
  Sensitive tools (screen_capture, code_runner, dev_scaffold_project) require UI
  approval before dispatch.
"""

from __future__ import annotations

import asyncio
import os
from typing import AsyncGenerator

from provider_context import ProviderContextHolder

# Re-export tool helpers for tests and backward compatibility.
from tool_registry import dispatch_sync  # noqa: E402, F401, I001
from voice.gemini_session import run_gemini_live_session
from voice.model import resolve_gemini_voice_model
from voice.pending_delete_sync import PendingDeleteSyncHolder
from voice.tool_args import (  # noqa: E402, I001
    enrich_voice_tool_args as _enrich_voice_tool_args,  # noqa: F401
)
from voice.tool_args import (
    infer_close_browser_args as _infer_close_browser_args,  # noqa: F401
)
from voice.tool_dispatch import (  # noqa: E402, I001
    BACKGROUND_VOICE_TOOLS as _BACKGROUND_VOICE_TOOLS,  # noqa: F401
)
from voice.tool_dispatch import (
    format_background_completion as _format_background_completion,  # noqa: F401
)
from voice.tool_dispatch import (
    queue_background_tool_result as _queue_background_tool_result,  # noqa: F401
)
from voice.tool_dispatch import (
    spawn_background_voice_tool as _spawn_background_voice_tool,  # noqa: F401
)
from voice_tool_approval import VoiceToolApprovalWaiter


async def run_voice_session(
    incoming_audio: asyncio.Queue[bytes | str | None],
    system_instruction: str,
    approval_waiter: VoiceToolApprovalWaiter | None = None,
    memory_enabled: bool = True,
    startup_message: str | None = None,
    turn_done: asyncio.Queue[None] | None = None,
    user_spoke: asyncio.Event | None = None,
    transcription_only: bool = False,
    meeting_id: str | None = None,
    provider_holder: ProviderContextHolder | None = None,
    pending_delete_holder: PendingDeleteSyncHolder | None = None,
    allow_sensitive: bool = False,
) -> AsyncGenerator[str, None]:
    """
    Drive a persistent Gemini Live voice session.

    Yields JSON string frames for the WebSocket client.  Reconnects automatically
    when the Gemini session drops so the frontend WebSocket stays open indefinitely.

    @param incoming_audio: queue of raw int16 PCM blobs at 16 kHz mono.
                           A ``None`` sentinel signals an explicit stop.
    @param system_instruction: system prompt passed to Gemini on each connect.
    @param approval_waiter: resolves UI approvals for screen_capture / code_runner.
    @param turn_done: optional queue signalled on every turn_complete so the
                      briefing pipeline can pace section injection.
    @param user_spoke: optional event set when the user's input transcription
                       arrives, so the briefing pipeline knows to yield the floor.
    @param transcription_only: when True the session only transcribes the user's
                       speech — no audio reply, no tools. Used by meeting mode.
    @param meeting_id: when set with ``transcription_only``, each completed user
                       utterance is appended to that meeting's live notes.
    """
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        from voice.frames import frame

        yield frame("error", message="GEMINI_API_KEY not configured.")
        return

    from agent.plan_mirror import set_mirror_loop

    set_mirror_loop(asyncio.get_running_loop())

    model = resolve_gemini_voice_model()

    try:
        from google import genai  # type: ignore[import]
    except ImportError:
        from voice.frames import frame

        yield frame(
            "error",
            message="google-genai package not installed. Run: pip install google-genai>=1.0",
        )
        return

    client = genai.Client(api_key=api_key, http_options={"api_version": "v1beta"})

    async for event in run_gemini_live_session(
        client,
        model,
        incoming_audio=incoming_audio,
        system_instruction=system_instruction,
        approval_waiter=approval_waiter,
        memory_enabled=memory_enabled,
        startup_message=startup_message,
        turn_done=turn_done,
        user_spoke=user_spoke,
        transcription_only=transcription_only,
        meeting_id=meeting_id,
        provider_holder=provider_holder,
        pending_delete_holder=pending_delete_holder,
        allow_sensitive=allow_sensitive,
    ):
        yield event
