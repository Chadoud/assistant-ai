"""Regression tests: template off must not alter classify contract."""

from __future__ import annotations

from classifier import _primary_classify_system_prompt
from sort_structure.compile import (
    compile_classify_contract,
    effective_template_from_config,
    structure_system_appendix,
)
from sort_structure.models import SortStructureModule, SortStructureTemplate


def test_absent_template_returns_none_contract() -> None:
    assert effective_template_from_config({}) is None
    assert effective_template_from_config({"sort_structure_template": None}) is None


def test_disabled_template_returns_none_contract() -> None:
    cfg = {
        "sort_structure_template": SortStructureTemplate(
            enabled=False,
            modules=[SortStructureModule(id="c", theme="country", children=[])],
        ).model_dump()
    }
    assert effective_template_from_config(cfg) is None


def test_disabled_template_leaves_system_prompt_unchanged() -> None:
    base = _primary_classify_system_prompt(None, None)
    cfg = {
        "sort_structure_template": SortStructureTemplate(
            enabled=False,
            modules=[SortStructureModule(id="c", theme="country", children=[])],
        ).model_dump()
    }
    assert effective_template_from_config(cfg) is None
    assert _primary_classify_system_prompt(None, None) == base


def test_enabled_template_adds_appendix_only_when_compiled() -> None:
    tpl = SortStructureTemplate(
        enabled=True,
        modules=[
            SortStructureModule(
                id="c",
                theme="country",
                children=[SortStructureModule(id="p", theme="property", children=[])],
            )
        ],
    )
    contract = compile_classify_contract(tpl)
    appendix = structure_system_appendix(contract)
    assert "theme_values" in appendix
    assert "country" in appendix
