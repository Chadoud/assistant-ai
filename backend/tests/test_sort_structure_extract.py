"""Structured extract parse tests."""

from __future__ import annotations

from sort_structure.compile import ClassifyContract, ThemeLevel
from sort_structure.extract import parse_structure_response


def _country_property_contract() -> ClassifyContract:
    return ClassifyContract(
        levels=(
            ThemeLevel(
                key="country",
                theme="country",
                prompt_instruction="Country name",
                max_folders=None,
                overflow_policy="merge_into_other",
                ui_label="country",
                custom_label=None,
            ),
            ThemeLevel(
                key="property",
                theme="property",
                prompt_instruction="Property name",
                max_folders=None,
                overflow_policy="merge_into_other",
                ui_label="property",
                custom_label=None,
            ),
        ),
        has_auto_tail=False,
    )


def test_parse_structure_response_builds_path() -> None:
    raw = (
        '{"theme_values":{"country":"France","property":"Villa Rose"},'
        '"auto_tail":"","confidence":0.9,"reason":"Lease","primary_purpose":"lease"}'
    )
    parsed = parse_structure_response(raw, _country_property_contract())
    assert parsed.get("structure_parse_failed") is not True
    assert parsed["folder_name"] == "France/Villa Rose"
    assert parsed["structure_values"]["country"] == "France"


def test_parse_structure_response_marks_failure_on_bad_json() -> None:
    parsed = parse_structure_response("not json at all", _country_property_contract())
    assert parsed.get("structure_parse_failed") is True
