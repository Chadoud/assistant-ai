"""Tree validation for sort structure templates."""

from __future__ import annotations

from destination_path import MAX_REL_DEST_SEGMENTS
from sort_structure.models import SortStructureModule, SortStructureTemplate


def module_tree_depth(modules: list[SortStructureModule]) -> int:
    """Maximum root-to-leaf depth (empty list → 0)."""
    if not modules:
        return 0
    return max(_depth(m) for m in modules)


def _depth(module: SortStructureModule) -> int:
    if not module.children:
        return 1
    return 1 + max(_depth(c) for c in module.children)


def validate_template(template: SortStructureTemplate) -> None:
    """
    Raise ValueError when the template is invalid.

    enabled=true requires at least one module; depth must not exceed MAX_REL_DEST_SEGMENTS;
    custom theme requires custom_label.
    """
    if not template.enabled:
        return
    if not template.modules:
        raise ValueError("Enabled sort structure template must include at least one module.")
    depth = module_tree_depth(template.modules)
    if depth > MAX_REL_DEST_SEGMENTS:
        raise ValueError(
            f"Sort structure depth {depth} exceeds maximum {MAX_REL_DEST_SEGMENTS}."
        )
    _validate_modules(template.modules)


def _validate_modules(modules: list[SortStructureModule]) -> None:
    for mod in modules:
        if mod.theme == "custom" and not (mod.custom_label or "").strip():
            raise ValueError("Custom theme modules require a custom_label.")
        if mod.children:
            _validate_modules(mod.children)
