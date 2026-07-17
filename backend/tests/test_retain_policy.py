"""Unit tests for retain / forget conversation scoring."""

from signal_quality.retain_policy import (
    MAP_SCORE_THRESHOLD,
    RetainTier,
    conversation_map_eligible,
    map_visible,
    memory_entry_to_retain_verdict,
    merge_llm_verdict,
    prompt_eligible,
    score_conversation,
)


def test_voice_check_forget():
    v = score_conversation("Can you hear me?", "")
    assert v.tier == RetainTier.FORGET
    assert v.ephemeral
    assert "voice_check" in v.reasons
    assert not map_visible(v)


def test_capability_faq_forget():
    v = score_conversation("What can Exo do?", "")
    assert v.tier == RetainTier.FORGET
    assert not map_visible(v)


def test_agent_retry_forget():
    v = score_conversation(
        "Please retry this autonomously: find my latest invoices",
        "",
    )
    assert v.tier == RetainTier.FORGET
    assert "agent_retry" in v.reasons


def test_untitled_forget():
    v = score_conversation("New conversation", "")
    assert v.tier == RetainTier.FORGET


def test_no_summary_archive():
    v = score_conversation("Build a cool app for our demo", "", message_count=1)
    assert v.tier == RetainTier.ARCHIVE
    assert "no_summary" in v.reasons
    assert not map_visible(v)


def test_cv_review_durable_with_memories():
    v = score_conversation(
        "Chady Kassab CV Review",
        "The user provided their CV as Chady Kassab, a Swiss Software Engineer "
        "in Geneva, detailing their technical skills and experience.",
        action_item_count=0,
        memory_link_count=3,
        message_count=20,
    )
    assert v.tier in (RetainTier.WORKING, RetainTier.DURABLE)
    assert v.score >= MAP_SCORE_THRESHOLD
    assert map_visible(v)


def test_action_items_boost_working():
    v = score_conversation(
        "Computer Memory & Ida Plan",
        "The user asked about RAM and mentioned a plan with Ida for Sunday.",
        action_item_count=1,
        memory_link_count=1,
        message_count=6,
    )
    assert map_visible(v)
    assert v.score >= 0.55


def test_pinned_always_durable():
    v = score_conversation("Can you hear me?", "", pinned=True)
    assert v.tier == RetainTier.DURABLE
    assert map_visible(v, pinned=True)
    assert prompt_eligible(v, pinned=True)


def test_connection_check_summary_archive():
    v = score_conversation(
        "Initial connection check",
        "The user checked if the assistant could hear them, confirming the connection was clear.",
    )
    assert v.tier == RetainTier.ARCHIVE
    assert not map_visible(v)


def test_conversation_map_eligible_row():
    assert conversation_map_eligible(
        {
            "retain_tier": "durable",
            "retain_score": 0.9,
            "summary": "CV review",
            "ephemeral": False,
            "archived_at": None,
            "pinned": False,
        }
    )
    assert not conversation_map_eligible(
        {
            "retain_tier": "forget",
            "retain_score": 0.1,
            "summary": "",
            "ephemeral": True,
            "archived_at": None,
            "pinned": False,
        }
    )
    assert conversation_map_eligible(
        {
            "retain_tier": "forget",
            "retain_score": 0.1,
            "summary": "",
            "ephemeral": True,
            "archived_at": None,
            "pinned": True,
        }
    )


def test_merge_llm_cannot_revive_hard_forget():
    rule = score_conversation("Please retry this: deploy", "")
    merged = merge_llm_verdict(
        rule,
        keep=True,
        score=0.95,
        kind="project",
        reason="important",
        resume_worthy=True,
    )
    assert merged.tier == RetainTier.FORGET


def test_memory_entry_adapter():
    durable = memory_entry_to_retain_verdict({"source": "manual", "reviewed": 1})
    assert durable.tier == RetainTier.DURABLE
    noisy = memory_entry_to_retain_verdict(
        {"source": "auto", "reviewed": 0, "noise_score": 0.8}
    )
    assert noisy.tier == RetainTier.FORGET
