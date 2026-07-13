"""Per-task resource budget — bounds cost and latency of an autonomous run.

A run can fan out into many tool calls and reasoning hops; without a ceiling that
becomes unbounded spend and runaway latency. ``Budget`` tracks tool calls and wall
clock and reports when a limit is hit, so the loop stops cleanly instead of looping.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field

DEFAULT_MAX_TOOL_CALLS = 12
DEFAULT_MAX_WALL_CLOCK_S = 180.0


@dataclass
class Budget:
    """Mutable spend tracker for one orchestrated task."""

    max_tool_calls: int = DEFAULT_MAX_TOOL_CALLS
    max_wall_clock_s: float = DEFAULT_MAX_WALL_CLOCK_S
    tool_calls: int = 0
    _now: "callable" = field(default=time.monotonic, repr=False)
    started_at: float = field(default=0.0)

    def __post_init__(self) -> None:
        if not self.started_at:
            self.started_at = self._now()

    def charge_tool(self) -> None:
        self.tool_calls += 1

    def elapsed_s(self) -> float:
        return self._now() - self.started_at

    def exceeded(self) -> str | None:
        """Return a human-readable reason if any limit is hit, else ``None``."""
        if self.tool_calls >= self.max_tool_calls:
            return f"tool-call budget reached ({self.max_tool_calls})"
        if self.elapsed_s() >= self.max_wall_clock_s:
            return f"time budget reached ({self.max_wall_clock_s:.0f}s)"
        return None
