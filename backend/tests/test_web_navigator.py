"""Safety unit tests for the OAuth-page browser navigator.

The model's chosen action passes through `_coerce_action`, which is the single
place that enforces the hard guarantees: never type into a credential field,
never click a deny/cancel control, and never act on a non-existent element.
"""

from __future__ import annotations

import pytest

from actions.web_navigator import (
    _coerce_action,
    _extract_json,
    _is_secret_field,
)

ELEMENTS = [
    {"ref": 1, "role": "button", "name": "Allow", "type": "button"},
    {"ref": 2, "role": "button", "name": "Cancel", "type": "button"},
    {"ref": 3, "role": "textbox", "name": "Password", "type": "password"},
    {"ref": 4, "role": "textbox", "name": "Search", "type": "text"},
]


@pytest.mark.parametrize(
    "name,field_type,expected",
    [
        ("Password", "password", True),
        ("anything", "password", True),
        ("One-time code", "text", True),
        ("2FA verification code", "text", True),
        ("Search", "text", False),
        ("Email", "email", False),
    ],
)
def test_is_secret_field(name, field_type, expected):
    assert _is_secret_field({"name": name, "type": field_type}) is expected


def test_typing_into_password_field_hands_over_to_user():
    action = _coerce_action({"type": "type", "ref": 3, "value": "hunter2"}, ELEMENTS)
    assert action["type"] == "need_user"
    assert action["value"] is None


def test_clicking_cancel_is_refused():
    action = _coerce_action({"type": "click", "ref": 2}, ELEMENTS)
    assert action["type"] == "wait"


def test_unknown_action_becomes_wait():
    action = _coerce_action({"type": "scroll", "ref": 1}, ELEMENTS)
    assert action["type"] == "wait"


def test_action_on_missing_element_becomes_wait():
    action = _coerce_action({"type": "click", "ref": 99}, ELEMENTS)
    assert action["type"] == "wait"


def test_valid_allow_click_passes_through():
    action = _coerce_action({"type": "click", "ref": 1, "reason": "approve"}, ELEMENTS)
    assert action["type"] == "click"
    assert action["ref"] == 1


def test_non_dict_model_output_is_safe():
    action = _coerce_action("not json", ELEMENTS)
    assert action["type"] == "wait"


def test_extract_json_handles_fenced_and_trailing_text():
    assert _extract_json('{"type": "done"}') == {"type": "done"}
    assert _extract_json('noise {"type": "wait", "ref": null} trailing') == {
        "type": "wait",
        "ref": None,
    }
    assert _extract_json("no json here") is None
