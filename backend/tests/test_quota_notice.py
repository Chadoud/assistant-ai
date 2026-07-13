"""Free-tier quota notice: detection + deduped listener fan-out."""

from __future__ import annotations

from orchestrator import quota_notice as qn


def test_is_free_tier_quota_error_matches_markers():
    assert qn.is_free_tier_quota_error(
        "429 RESOURCE_EXHAUSTED: GenerateRequestsPerDay free_tier limit"
    )
    assert qn.is_free_tier_quota_error("Quota exceeded for generate_content_free_tier_requests")


def test_is_free_tier_quota_error_ignores_generic_429():
    # A paid-key transient 429 without a free-tier marker should NOT nudge.
    assert not qn.is_free_tier_quota_error("429 Too Many Requests, retry later")
    assert not qn.is_free_tier_quota_error("")


def test_listener_receives_event_and_unregister_stops_it(monkeypatch):
    # Isolate dedupe state for a clean run.
    monkeypatch.setattr(qn, "_last_emit", {})
    received: list[dict] = []
    unregister = qn.register_quota_listener(received.append)
    try:
        qn.maybe_emit_quota_notice("free_tier daily limit reached", provider="gemini")
        assert received == [{"provider": "gemini", "reason": "free_tier"}]
    finally:
        unregister()
    qn.maybe_emit_quota_notice("free_tier limit", provider="openai")
    assert len(received) == 1  # unregistered listener no longer fires


def test_dedupes_within_window(monkeypatch):
    monkeypatch.setattr(qn, "_last_emit", {})
    received: list[dict] = []
    unregister = qn.register_quota_listener(received.append)
    try:
        qn.maybe_emit_quota_notice("free_tier", provider="gemini")
        qn.maybe_emit_quota_notice("free_tier", provider="gemini")
        assert len(received) == 1  # second within window is suppressed
        # A different provider is tracked independently.
        qn.maybe_emit_quota_notice("free_tier", provider="openai")
        assert len(received) == 2
    finally:
        unregister()


def test_non_quota_error_does_not_emit(monkeypatch):
    monkeypatch.setattr(qn, "_last_emit", {})
    received: list[dict] = []
    unregister = qn.register_quota_listener(received.append)
    try:
        qn.maybe_emit_quota_notice("connection reset", provider="gemini")
        assert received == []
    finally:
        unregister()


def test_listener_exception_is_swallowed(monkeypatch):
    monkeypatch.setattr(qn, "_last_emit", {})

    def _boom(_event: dict) -> None:
        raise RuntimeError("listener blew up")

    unregister = qn.register_quota_listener(_boom)
    try:
        # Must not raise even though the listener does.
        qn.maybe_emit_quota_notice("free_tier", provider="gemini")
    finally:
        unregister()
