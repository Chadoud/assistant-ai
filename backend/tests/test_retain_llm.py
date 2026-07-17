"""Tests for optional mid-band retain LLM judge."""

from __future__ import annotations

import signal_quality.retain_llm as retain_llm
from signal_quality.retain_policy import RetainTier, score_conversation


def test_judge_merges_mocked_complete(monkeypatch):
    retain_llm.clear_retain_llm_cache()

    def fake_complete(_system, _prompt):
        return (
            '{"keep": true, "score": 0.8, "kind": "project", '
            '"reason": "active demo work", "resume_worthy": true}'
        )

    monkeypatch.setattr("llm.complete.complete", fake_complete)

    rule = score_conversation(
        "App Deployment Issues & Vercel",
        "The user hit an API error deploying a demo app and chose Vercel.",
        action_item_count=0,
        memory_link_count=0,
        message_count=6,
    )
    assert 0.35 <= rule.score <= 0.70 or rule.tier == RetainTier.WORKING

    # Force mid-band by using a mid-score rule path
    from signal_quality.retain_policy import JudgedBy, RetainVerdict

    mid = RetainVerdict(RetainTier.WORKING, 0.5, ["has_summary"], JudgedBy.RULE)
    merged = retain_llm.judge_conversation_retain(
        title="App Deployment Issues & Vercel",
        summary="The user hit an API error deploying a demo app and chose Vercel.",
        action_items=[],
        rule=mid,
    )
    assert merged is not None
    assert merged.judged_by.value == "llm"
    assert merged.score >= 0.5


def test_judge_cache_avoids_second_complete(monkeypatch):
    retain_llm.clear_retain_llm_cache()
    calls = {"n": 0}

    def fake_complete(_system, _prompt):
        calls["n"] += 1
        return (
            '{"keep": false, "score": 0.2, "kind": "faq", '
            '"reason": "capabilities", "resume_worthy": false}'
        )

    monkeypatch.setattr("llm.complete.complete", fake_complete)
    from signal_quality.retain_policy import JudgedBy, RetainTier, RetainVerdict

    mid = RetainVerdict(RetainTier.WORKING, 0.5, ["has_summary"], JudgedBy.RULE)
    kwargs = dict(
        title="X",
        summary="Y summary long enough",
        action_items=["a"],
        rule=mid,
    )
    retain_llm.judge_conversation_retain(**kwargs)
    retain_llm.judge_conversation_retain(**kwargs)
    assert calls["n"] == 1


def test_hard_forget_not_revived_via_merge():
    rule = score_conversation("Please retry this: deploy", "")
    from signal_quality.retain_policy import merge_llm_verdict

    merged = merge_llm_verdict(
        rule,
        keep=True,
        score=0.99,
        kind="project",
        reason="important",
        resume_worthy=True,
    )
    assert merged.tier == RetainTier.FORGET
