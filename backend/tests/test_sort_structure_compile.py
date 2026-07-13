"""Tests for compile_classify_contract."""

from __future__ import annotations

from sort_structure.compile import (
    classify_contract_from_mapping,
    classify_contract_to_mapping,
    compile_classify_contract,
    structure_system_appendix,
)
from sort_structure.models import SortStructureModule, SortStructureTemplate


def test_compile_flattens_nested_modules() -> None:
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
    assert len(contract.levels) == 2
    assert contract.levels[0].theme == "country"
    assert contract.levels[1].theme == "property"
    appendix = structure_system_appendix(contract)
    assert "theme_values" in appendix
    assert "country" in appendix


def test_classify_contract_wire_roundtrip() -> None:
    tpl = SortStructureTemplate(
        enabled=True,
        modules=[
            SortStructureModule(
                id="c",
                theme="country",
                children=[SortStructureModule(id="a", theme="auto", children=[])],
            )
        ],
    )
    contract = compile_classify_contract(tpl)
    wire = classify_contract_to_mapping(contract)
    restored = classify_contract_from_mapping(wire)
    assert restored is not None
    assert len(restored.levels) == len(contract.levels)
    assert restored.has_auto_tail is True
    assert restored.levels[0].key == contract.levels[0].key
