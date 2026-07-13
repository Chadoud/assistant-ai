"""Tests for mail_manage intent classification."""

from __future__ import annotations

import pytest

from services.assistant.intent import classify_intent, classify_intent_from_message_body


@pytest.mark.parametrize(
    "text",
    [
        "I don't want to receive chess.com emails anymore",
        "Block emails from chess.com",
        "Can you unsubscribe from chess.com newsletters",
        "Stop those emails from chess.com",
        "Filter out mail from spammer@example.com",
        "Je ne veux plus recevoir ces emails de chess.com",
    ],
)
def test_mail_manage_intent(text: str) -> None:
    assert classify_intent_from_message_body(text) == "mail_manage"


@pytest.mark.parametrize(
    "text",
    [
        "Show me my inbox",
        "Any invoices in my mail",
    ],
)
def test_read_mail_not_manage(text: str) -> None:
    assert classify_intent_from_message_body(text) == "read_mail"


def test_mail_manage_follow_up_reuse() -> None:
    prior = "Block chess.com emails"
    assert classify_intent("yes do it", prior) == "mail_manage"
