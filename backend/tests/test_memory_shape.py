"""Unit tests for email-subject and inbox-recap transcript heuristics."""

from __future__ import annotations

from signal_quality.memory_shape import (
    PROMO_DENSITY_SKIP_THRESHOLD,
    looks_like_email_subject,
    looks_like_inbox_recap,
    transcript_promo_density,
)


def test_looks_like_email_subject_requires_multiple_signals() -> None:
    assert looks_like_email_subject(
        "Commitment: Nouvelle Surface Go 3",
        "Nouvelle Surface Go 3 — Nouveau Windows 11",
    )
    assert not looks_like_email_subject("dog", "Rex is a golden retriever")
    assert not looks_like_email_subject("projet_phoenix", "Deadline vendredi pour le client")


def test_looks_like_email_subject_detects_re_prefix() -> None:
    assert looks_like_email_subject(
        "Re: Summer sale",
        "50% off everything — limited time only!",
    )


def test_transcript_promo_density_empty_is_zero() -> None:
    assert transcript_promo_density("") == 0.0
    assert transcript_promo_density("User: hello\nAssistant: sure") == 0.0


def test_transcript_promo_density_high_on_marketing_lines() -> None:
    transcript = "\n".join(
        [
            "Assistant: 50% off everything — limited time only!",
            "Assistant: Jouez GRATUITEMENT ce week-end !",
            "Assistant: Unsubscribe anytime — special offer inside",
            "User: thanks",
        ]
    )
    assert transcript_promo_density(transcript) >= PROMO_DENSITY_SKIP_THRESHOLD


def test_looks_like_inbox_recap_needs_minimum_lines() -> None:
    short = "\n".join(f"Assistant: promo line {i}" for i in range(5))
    assert not looks_like_inbox_recap(short)


def test_looks_like_inbox_recap_detects_assistant_heavy_thread() -> None:
    transcript = "\n".join(
        [
            "Assistant: Surface Go 3 promo — shop now",
            "Assistant: Ubisoft sale this weekend",
            "Assistant: OneDrive storage warning",
            "Assistant: Division game update",
            "Assistant: Avatar game launch",
            "Assistant: Discount on editions",
            "Assistant: Free weekend play",
            "Assistant: Another promo subject line",
            "Assistant: Yet another marketing line",
        ]
    )
    assert looks_like_inbox_recap(transcript)


def test_looks_like_inbox_recap_allows_first_person_user_voice() -> None:
    transcript = "\n".join(
        [
            "User: I need to follow up with Alice about my contract",
            "Assistant: I'll note that for you",
            "User: My dog Rex needs a vet visit Friday",
            "Assistant: Got it",
            "User: I prefer morning meetings",
            "Assistant: Noted",
            "User: I'm working on project Phoenix",
            "Assistant: Understood",
        ]
    )
    assert not looks_like_inbox_recap(transcript)
