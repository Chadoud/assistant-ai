"""Tests for immutable core sort prompt composition."""

from __future__ import annotations

from classifier_prompts import (
    MAX_SORT_USER_PROMPT_CHARS,
    SYSTEM_PROMPT,
    USER_SORT_PROMPT_OVERLAY_PREFIX,
    compose_sort_system_prompt,
)


def test_compose_sort_system_prompt_empty_uses_builtin() -> None:
    assert compose_sort_system_prompt(None) == SYSTEM_PROMPT
    assert compose_sort_system_prompt("") == SYSTEM_PROMPT
    assert compose_sort_system_prompt("   ") == SYSTEM_PROMPT


def test_compose_sort_system_prompt_appends_user_overlay() -> None:
    custom = "Prefer Swiss French labels for tax documents."
    out = compose_sort_system_prompt(custom)
    assert out.startswith(SYSTEM_PROMPT)
    assert USER_SORT_PROMPT_OVERLAY_PREFIX in out
    assert out.endswith(custom)
    assert custom not in SYSTEM_PROMPT


def test_compose_sort_system_prompt_caps_user_length() -> None:
    long_custom = "x" * (MAX_SORT_USER_PROMPT_CHARS + 500)
    out = compose_sort_system_prompt(long_custom)
    assert out.endswith("x" * MAX_SORT_USER_PROMPT_CHARS)
    assert len(out) == len(SYSTEM_PROMPT) + len(USER_SORT_PROMPT_OVERLAY_PREFIX) + MAX_SORT_USER_PROMPT_CHARS
