"""Tests for sort structure template validation."""

from __future__ import annotations

import pytest

from sort_structure.models import SortStructureModule, SortStructureTemplate
from sort_structure.validate import module_tree_depth, validate_template


def test_validate_disabled_empty_ok() -> None:
    validate_template(SortStructureTemplate(enabled=False, modules=[]))


def test_validate_enabled_requires_modules() -> None:
    with pytest.raises(ValueError, match="at least one module"):
        validate_template(SortStructureTemplate(enabled=True, modules=[]))


def test_validate_custom_requires_label() -> None:
    tpl = SortStructureTemplate(
        enabled=True,
        modules=[SortStructureModule(id="a", theme="custom", children=[])],
    )
    with pytest.raises(ValueError, match="custom_label"):
        validate_template(tpl)


def test_module_tree_depth() -> None:
    root = SortStructureModule(
        id="r",
        theme="country",
        children=[SortStructureModule(id="c", theme="property", children=[])],
    )
    assert module_tree_depth([root]) == 2
