"""Tests for the runtime promise-without-action guard."""

from __future__ import annotations

import pytest

from voice_promise_guard import looks_like_unfulfilled_promise


@pytest.mark.parametrize(
    "text",
    [
        # English
        "I'll navigate to the site and check that for you.",
        "Let me check your account balance now.",
        "I'm going to open the dashboard.",
        "Give me a second while I pull that up.",
        "Let me move those emails for you.",
        "Let me work through that. I'm on it, the process is running in the background.",
        # French — the exact failure from the debug export
        "Je vais naviguer vers Anthropic et chercher les crédits.",
        "Je m'en occupe tout de suite.",
        "Laisse-moi vérifier ça.",
        "Je vérifie ton solde maintenant.",
        # German
        "Ich werde das für dich überprüfen.",
        "Lass mich kurz nachschauen.",
        "Ich kümmere mich darum.",
        # Italian
        "Vado a controllare il tuo account.",
        "Me ne occupo subito.",
        "Controllo subito il saldo.",
    ],
)
def test_detects_commitments(text: str) -> None:
    assert looks_like_unfulfilled_promise(text) is True


@pytest.mark.parametrize(
    "text",
    [
        # Plain answers / acknowledgements — no action promised.
        "It's overcast in Geneva, 15 degrees.",
        "Your next meeting is at 3 PM.",
        "Sure, that sounds good.",
        "Okay.",
        "",
        # Inability admissions — honesty already satisfied, must NOT nudge.
        "I can't check your Anthropic credit balance.",
        "Je n'ai pas la possibilité de vérifier ce solde.",
        "Je ne peux pas faire ça.",
        "Ich kann das nicht prüfen.",
        "Non posso accedere a quell'account.",
        # Inability + a forward verb together still skips (conservative).
        "I can't do that, but I'll explain why.",
    ],
)
def test_ignores_non_promises_and_admissions(text: str) -> None:
    assert looks_like_unfulfilled_promise(text) is False


def test_short_text_is_never_a_promise() -> None:
    assert looks_like_unfulfilled_promise("I'll") is False


def test_detects_false_completion_without_tool() -> None:
    assert (
        looks_like_unfulfilled_promise(
            "Je l'ai ajouté à votre calendrier pour demain à midi pour une heure."
        )
        is True
    )
    assert looks_like_unfulfilled_promise("I've added it to your calendar for tomorrow.") is True


def test_tool_failed_nudge_constant_exists() -> None:
    from voice_promise_guard import TOOL_FAILED_NUDGE

    assert "tool call failed" in TOOL_FAILED_NUDGE.lower()
