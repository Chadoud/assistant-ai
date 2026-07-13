"""Reconnect backoff and weak-connection signaling for Gemini Live voice sessions."""

from __future__ import annotations

import random
from dataclasses import dataclass

# Base delay before the first reconnect attempt after a dropped session.
RECONNECT_DELAY_S = 2

# Ceiling for exponential backoff so a long outage never parks on an excessive interval.
MAX_RECONNECT_DELAY_S = 30.0

# Multiplier applied per consecutive failure (exponential backoff).
BACKOFF_FACTOR = 1.7

# A session connected at least this long is "healthy"; drop resets backoff.
STABLE_SESSION_S = 15.0

# After this many consecutive failed/short sessions, signal weak connection once.
WEAK_CONNECTION_THRESHOLD = 4


def compute_reconnect_delay(consecutive_failures: int) -> float:
    """Jittered exponential backoff, capped at the configured ceiling.

    Jitter (up to +25%) avoids synchronized retry storms on flaky networks.
    """
    exponent = max(0, consecutive_failures - 1)
    base = RECONNECT_DELAY_S * (BACKOFF_FACTOR ** exponent)
    delay = min(MAX_RECONNECT_DELAY_S, base)
    jitter = delay * 0.25 * random.random()
    return round(delay + jitter, 2)


@dataclass
class ReconnectState:
    """Tracks reconnect backoff and whether the UI was told the link is weak."""

    reconnect_delay_s: float = float(RECONNECT_DELAY_S)
    consecutive_failures: int = 0
    weak_connection_signalled: bool = False

    def record_session_drop(self, stable_duration_s: float) -> None:
        """Update backoff after a session ends unexpectedly."""
        if stable_duration_s >= STABLE_SESSION_S:
            self.consecutive_failures = 0
            self.weak_connection_signalled = False
            self.reconnect_delay_s = float(RECONNECT_DELAY_S)
        else:
            self.consecutive_failures += 1
            self.reconnect_delay_s = compute_reconnect_delay(self.consecutive_failures)

    def should_signal_weak_connection(self) -> bool:
        """Return True once when failures cross the weak-connection threshold."""
        return (
            self.consecutive_failures >= WEAK_CONNECTION_THRESHOLD
            and not self.weak_connection_signalled
        )

    def mark_weak_connection_signalled(self) -> None:
        """Record that the UI received a connection_weak frame."""
        self.weak_connection_signalled = True
