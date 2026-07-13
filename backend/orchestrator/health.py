"""Provider health: rate-limit pacing, circuit breaking, and error classification.

This is the self-healing core of the orchestrator. It answers two questions for
every provider before and after a call:

  - "Can I call this provider right now?" (token bucket + circuit breaker)
  - "This call failed — is it worth relaying, and how long should I avoid this
    provider?" (transient-error + invalid-model detection + retry-after parsing)

Design choices:
  - Rate limiting is REACTIVE by default. We don't hard-code each vendor's
    quota (a paid key has very different limits than the free tier); instead the
    bucket is generous and the circuit breaker reacts to real 429s, honoring the
    server-provided ``retry_after``. This avoids throttling users who paid for
    headroom while still recovering cleanly when a limit is actually hit.
  - All state is in-process and guarded by a single lock — simple and correct for
    a single-user desktop backend. A multi-tenant server would externalize this.
"""

from __future__ import annotations

import re
import threading
import time
from dataclasses import dataclass, field
from typing import Callable

# Generous default pacing — the circuit breaker (reacting to real 429s) is the
# true limiter. One bucket "token" == one request.
_DEFAULT_BUCKET_CAPACITY = 30
_DEFAULT_REFILL_PER_SEC = 30 / 60  # ~30 requests/minute sustained
_DEFAULT_FAIL_THRESHOLD = 3
_DEFAULT_BASE_COOLDOWN_S = 20.0
_DEFAULT_MAX_COOLDOWN_S = 120.0

_TRANSIENT_MARKERS = (
    "429",
    "resource_exhausted",
    "rate limit",
    "ratelimit",
    "quota",
    "overloaded",
    "503",
    "502",
    "500 ",
    "timeout",
    "timed out",
    "temporarily",
    "unavailable",
    "connection",
    "disconnect",
    "disconnected",
    "econnreset",
    "reset by peer",
    "remoteprotocol",
    "keepalive",
    "ping timeout",
    "abnormal closure",
    # DNS / name-resolution failures: the host couldn't be looked up at all.
    # These are almost always a transient local network drop (wifi/VPN/DNS blip),
    # so they're worth a relay/retry rather than surfacing as a hard error.
    #   Windows: "[Errno 11001] getaddrinfo failed"
    #   Linux:   "Temporary failure in name resolution" / "Name or service not known"
    #   Node:    "ENOTFOUND" / "EAI_AGAIN"
    "getaddrinfo",
    "name resolution",
    "name or service not known",
    "nodename nor servname",
    "network is unreachable",
    "enotfound",
    "eai_again",
)


def parse_retry_after(message: str) -> float | None:
    """Extract a retry delay in seconds from a provider error string, if present.

    Recognizes Gemini's ``retry in 41.19s`` and ``retryDelay: '41s'`` plus a plain
    ``retry-after: 41`` header echo. Returns clamped seconds, or ``None`` if the
    message carries no explicit delay.
    """
    if not message:
        return None
    lowered = message.lower()
    patterns = (
        r"retry in ([\d.]+)\s*s",
        r"retrydelay['\"]?\s*[:=]?\s*['\"]?(\d+)\s*s",
        r"retry-?after['\"]?\s*[:=]?\s*(\d+)",
    )
    for pattern in patterns:
        match = re.search(pattern, lowered)
        if match:
            try:
                return min(max(float(match.group(1)), 1.0), _DEFAULT_MAX_COOLDOWN_S)
            except ValueError:
                continue
    return None


_MODEL_FAILOVER_MARKERS = (
    "404",
    "model not found",
    "model_not_found",
    "invalid model",
    "unknown model",
    "no such model",
    "does not exist",
    "not_found",
)


def is_transient_error(message: str) -> bool:
    """True if the error looks worth relaying to another provider / retrying.

    Quota, rate-limit, overload, 5xx, timeout, and connection errors are transient.
    Auth errors (bad key, 401) are NOT — relaying would fail the same way.
    Invalid or missing model ids (404) are handled by :func:`is_model_failover_error`.
    """
    if not message:
        return False
    lowered = message.lower()
    if any(marker in lowered for marker in _TRANSIENT_MARKERS):
        return True
    return False


def is_model_failover_error(message: str) -> bool:
    """True when the provider rejected the model id — relay to the next candidate.

    Typical cases: Anthropic/OpenAI 404 for a retired slug, or a model the user's
    account cannot access. Unlike auth failures, another provider may succeed with
    the user's configured engine.
    """
    if not message:
        return False
    lowered = message.lower()
    if any(marker in lowered for marker in _MODEL_FAILOVER_MARKERS):
        return True
    return False


def is_failover_error(message: str) -> bool:
    """True when the Conductor should try the next provider in the relay chain.

    Combines transient quota/5xx/timeout errors with invalid-model (404) failures.
    Auth and permission errors remain hard stops for text completion (each relay uses
    its own API key — see :func:`is_provider_credential_error` for vision failover).
    """
    return is_transient_error(message) or is_model_failover_error(message)


_PROVIDER_CREDENTIAL_MARKERS = (
    "invalid api key",
    "api key not valid",
    "api_key_invalid",
    "please pass a valid api key",
    "authentication",
    "incorrect api key",
    "permission denied",
    "unauthorized",
    "invalid x-api-key",
    "credit balance",
    "billing",
    "payment required",
)


def is_provider_credential_error(message: str) -> bool:
    """True when *this* provider rejected credentials or billing — try the next candidate.

    Used by vision failover: Gemini may rate-limit while a stale Anthropic backup key
    should be skipped rather than surfacing as the final error. Each candidate carries
    its own key, so an auth failure on one provider does not imply the next will fail.
    """
    if not message:
        return False
    lowered = message.lower()
    if any(marker in lowered for marker in _PROVIDER_CREDENTIAL_MARKERS):
        return True
    if "401" in lowered or "403" in lowered or "402" in lowered:
        return True
    match = re.search(r"api error \((\d{3})\)", lowered)
    if match:
        code = int(match.group(1))
        if code in (401, 402, 403):
            return True
    return False


def should_relay_vision_error(message: str) -> bool:
    """Whether vision should try the next configured provider after this failure."""
    return is_failover_error(message) or is_provider_credential_error(message)


@dataclass
class _TokenBucket:
    capacity: float
    refill_per_sec: float
    tokens: float = field(init=False)
    updated: float = field(init=False)

    def __post_init__(self) -> None:
        self.tokens = self.capacity
        self.updated = 0.0  # set on first use via _refill with the injected clock

    def _refill(self, now: float) -> None:
        if self.updated == 0.0:
            self.updated = now
            return
        elapsed = max(0.0, now - self.updated)
        self.tokens = min(self.capacity, self.tokens + elapsed * self.refill_per_sec)
        self.updated = now

    def try_acquire(self, now: float, amount: float = 1.0) -> tuple[bool, float]:
        """Take ``amount`` tokens. Returns (allowed, seconds_until_available)."""
        self._refill(now)
        if self.tokens >= amount:
            self.tokens -= amount
            return True, 0.0
        if self.refill_per_sec <= 0:
            return False, float("inf")
        return False, (amount - self.tokens) / self.refill_per_sec


@dataclass
class _CircuitBreaker:
    fail_threshold: int
    base_cooldown_s: float
    max_cooldown_s: float
    consecutive_failures: int = 0
    open_until: float = 0.0

    def available(self, now: float) -> tuple[bool, float]:
        if now >= self.open_until:
            return True, 0.0
        return False, self.open_until - now

    def record_success(self) -> None:
        self.consecutive_failures = 0
        self.open_until = 0.0

    def record_failure(self, now: float, retry_after: float | None) -> None:
        self.consecutive_failures += 1
        if retry_after is not None:
            cooldown = retry_after
        elif self.consecutive_failures >= self.fail_threshold:
            # Exponential-ish backoff once we cross the threshold.
            over = self.consecutive_failures - self.fail_threshold
            cooldown = min(self.base_cooldown_s * (2**over), self.max_cooldown_s)
        else:
            cooldown = 0.0  # tolerate the first few blips without opening
        self.open_until = now + cooldown


@dataclass
class Availability:
    """Whether a provider can be called now, and if not, when to retry."""

    ok: bool
    retry_after: float
    reason: str = ""


class _ProviderState:
    def __init__(self, time_fn: Callable[[], float]) -> None:
        self._time = time_fn
        self._bucket = _TokenBucket(_DEFAULT_BUCKET_CAPACITY, _DEFAULT_REFILL_PER_SEC)
        self._breaker = _CircuitBreaker(
            _DEFAULT_FAIL_THRESHOLD, _DEFAULT_BASE_COOLDOWN_S, _DEFAULT_MAX_COOLDOWN_S
        )

    def check(self) -> Availability:
        now = self._time()
        open_ok, cooldown = self._breaker.available(now)
        if not open_ok:
            return Availability(False, cooldown, "cooling down after errors")
        allowed, wait = self._bucket.try_acquire(now)
        if not allowed:
            return Availability(False, wait, "rate limit pacing")
        return Availability(True, 0.0)

    def peek(self) -> Availability:
        """Read-only health check that does NOT consume a rate-limit token.

        Used to render status (the circuit-breaker state) without affecting pacing.
        """
        open_ok, cooldown = self._breaker.available(self._time())
        if not open_ok:
            return Availability(False, cooldown, "cooling down after errors")
        return Availability(True, 0.0)

    def record_success(self) -> None:
        self._breaker.record_success()

    def record_failure(self, retry_after: float | None) -> None:
        self._breaker.record_failure(self._time(), retry_after)


class HealthRegistry:
    """Thread-safe per-provider health (bucket + breaker)."""

    def __init__(self, time_fn: Callable[[], float] = time.monotonic) -> None:
        self._time = time_fn
        self._lock = threading.Lock()
        self._states: dict[str, _ProviderState] = {}

    def _state(self, provider_id: str) -> _ProviderState:
        state = self._states.get(provider_id)
        if state is None:
            state = _ProviderState(self._time)
            self._states[provider_id] = state
        return state

    def check(self, provider_id: str) -> Availability:
        """Reserve one slot if available; otherwise report when to retry."""
        with self._lock:
            return self._state(provider_id).check()

    def peek(self, provider_id: str) -> Availability:
        """Read provider health without reserving a slot (for status displays)."""
        with self._lock:
            return self._state(provider_id).peek()

    def record_success(self, provider_id: str) -> None:
        with self._lock:
            self._state(provider_id).record_success()

    def record_failure(self, provider_id: str, *, retry_after: float | None = None) -> None:
        with self._lock:
            self._state(provider_id).record_failure(retry_after)


# Process-wide registry shared by the conductor and the vision/automation loops.
REGISTRY = HealthRegistry()
