"""Free-tier API quota notifications.

When a provider key is on its free tier and hits the daily/per-minute request cap,
the failure is normally invisible to the user: the Conductor relays to a backup
provider silently, or the work happens on a background thread with no UI sink.

This module is a tiny, process-wide notification channel so the live UI (voice WS,
chat SSE) can surface a one-time, dismissible hint recommending a paid API key.

It is intentionally distinct from ``relay_events`` (context-scoped, per-request):
quota notices must reach listeners that live on a *different* thread than the call
that detected the limit, so the channel is a plain module-level listener list.
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Callable

logger = logging.getLogger(__name__)

QuotaListener = Callable[[dict[str, str]], None]

# Markers that specifically indicate a FREE-TIER request cap (not just any 429).
# A paid key can still hit a transient 429, but those carry different metadata; we
# only nudge toward a paid key when the error names the free tier.
_FREE_TIER_MARKERS = (
    "free_tier",
    "freetier",
    "free tier",
    "generaterequestsperday",
    "generate_content_free_tier_requests",
)

# A generic quota/exhaustion marker only counts as free-tier when paired with one
# of the markers above; on its own it may be a paid transient limit.
_QUOTA_MARKERS = (
    "resource_exhausted",
    "quota exceeded",
    "exceeded your current quota",
)

# Don't spam: at most one notice per provider within this window.
_DEDUPE_WINDOW_S = 60.0

_lock = threading.Lock()
_listeners: list[QuotaListener] = []
_last_emit: dict[str, float] = {}


def is_free_tier_quota_error(message: str) -> bool:
    """True when ``message`` indicates a *free-tier* request cap was hit.

    Requires an explicit free-tier marker so a paid key's transient 429 does not
    trigger an "add a paid key" nudge the user has already acted on.
    """
    if not message:
        return False
    lowered = message.lower()
    if any(marker in lowered for marker in _FREE_TIER_MARKERS):
        return True
    return False


def register_quota_listener(callback: QuotaListener) -> Callable[[], None]:
    """Register ``callback`` to receive free-tier quota notices.

    :returns: an unregister function the caller must invoke on teardown.
    """
    with _lock:
        _listeners.append(callback)

    def _unregister() -> None:
        with _lock:
            try:
                _listeners.remove(callback)
            except ValueError:
                pass

    return _unregister


def maybe_emit_quota_notice(error: str, *, provider: str = "gemini") -> None:
    """Notify listeners when ``error`` is a free-tier cap (deduped per provider).

    Safe to call from any thread; never raises.
    """
    if not is_free_tier_quota_error(error):
        return
    now = time.monotonic()
    with _lock:
        last = _last_emit.get(provider, 0.0)
        if now - last < _DEDUPE_WINDOW_S:
            return
        _last_emit[provider] = now
        listeners = list(_listeners)
    if not listeners:
        return
    event = {"provider": provider, "reason": "free_tier"}
    for listener in listeners:
        try:
            listener(event)
        except Exception:  # noqa: BLE001 — a UI notification must never break work
            logger.debug("quota listener raised", exc_info=True)
