"""Briefing abort: drop queued sections when the user submits a new task."""

from __future__ import annotations

import asyncio

from voice.briefing import drain_queued_briefing_injections


async def _run_drain(items: list[object]) -> tuple[list[object], int]:
    queue: asyncio.Queue = asyncio.Queue()
    for item in items:
        await queue.put(item)
    dropped = drain_queued_briefing_injections(queue)
    remaining: list[object] = []
    while not queue.empty():
        remaining.append(queue.get_nowait())
    return remaining, dropped


def test_drain_queued_briefing_injections_drops_briefing_only():
    remaining, dropped = asyncio.run(
        _run_drain(
            [
                b"\x00\x01",
                "[BRIEFING: NEWS — headline gist]",
                "Create a React chat app",
                "[BRIEFING: WEATHER — Geneva forecast]",
            ]
        )
    )
    assert dropped == 2
    assert remaining == [b"\x00\x01", "Create a React chat app"]
