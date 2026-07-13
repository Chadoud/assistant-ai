"""Tests for path assembly from theme values."""

from __future__ import annotations

from sort_structure.assemble import assemble_path
from sort_structure.compile import ClassifyContract, ThemeLevel, compile_classify_contract
from sort_structure.models import SortStructureModule, SortStructureTemplate


def _country_property_contract() -> ClassifyContract:
    return ClassifyContract(
        levels=(
            ThemeLevel(
                key="country",
                theme="country",
                prompt_instruction="",
                max_folders=3,
                overflow_policy="merge_into_other",
                ui_label="country",
                custom_label=None,
            ),
            ThemeLevel(
                key="property",
                theme="property",
                prompt_instruction="",
                max_folders=None,
                overflow_policy="merge_into_other",
                ui_label="property",
                custom_label=None,
            ),
        ),
        has_auto_tail=False,
    )


def test_assemble_country_property() -> None:
    contract = _country_property_contract()
    path, values = assemble_path(
        contract,
        {"country": "France", "property": "Villa Rose"},
        None,
        [],
    )
    assert path == "France/Villa Rose"
    assert values["country"] == "France"
    assert values["property"] == "Villa Rose"


def test_assemble_usa_alias() -> None:
    contract = ClassifyContract(
        levels=(
            ThemeLevel(
                key="country",
                theme="country",
                prompt_instruction="",
                max_folders=None,
                overflow_policy="merge_into_other",
                ui_label="country",
                custom_label=None,
            ),
        ),
        has_auto_tail=False,
    )
    path, _ = assemble_path(contract, {"country": "USA"}, None, [])
    assert path == "United States"


def test_assemble_missing_value_uncertain() -> None:
    contract = _country_property_contract()
    path, values = assemble_path(contract, {"country": "France", "property": ""}, None, [])
    assert path == "Uncertain"
    assert "country" in values


def test_assemble_custom_client_project() -> None:
    tpl = SortStructureTemplate(
        enabled=True,
        modules=[
            SortStructureModule(
                id="c",
                theme="custom",
                custom_label="Client",
                children=[
                    SortStructureModule(id="p", theme="project", children=[]),
                ],
            )
        ],
    )
    contract = compile_classify_contract(tpl)
    path, values = assemble_path(
        contract,
        {"client": "Acme Corp", "project": "Website Redesign"},
        None,
        [],
    )
    assert path == "Acme Corp/Website Redesign"
    assert values["client"] == "Acme Corp"
    assert values["project"] == "Website Redesign"
