"""Compile sort structure templates into classify contracts."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sort_structure.models import SortStructureModule, SortStructureTemplate, SortThemeId
from sort_structure.themes import theme_level_key, theme_prompt_instruction
from sort_structure.validate import validate_template


@dataclass(frozen=True)
class ThemeLevel:
    key: str
    theme: SortThemeId
    prompt_instruction: str
    max_folders: int | None
    overflow_policy: str
    ui_label: str
    custom_label: str | None


@dataclass(frozen=True)
class ClassifyContract:
    levels: tuple[ThemeLevel, ...]
    has_auto_tail: bool


def effective_template_from_config(cfg: dict[str, Any]) -> SortStructureTemplate | None:
    """Parse job config sort_structure_template; None when disabled or absent."""
    raw = cfg.get("sort_structure_template")
    if raw is None:
        return None
    try:
        if isinstance(raw, SortStructureTemplate):
            tpl = raw
        elif isinstance(raw, dict):
            tpl = SortStructureTemplate.model_validate(raw)
        else:
            return None
    except Exception:
        return None
    if not tpl.enabled or not tpl.modules:
        return None
    try:
        validate_template(tpl)
    except ValueError:
        return None
    return tpl


def compile_classify_contract(
    template: SortStructureTemplate,
    language: str = "English",
) -> ClassifyContract:
    """Flatten module tree into ordered theme levels for classification."""
    validate_template(template)
    levels: list[ThemeLevel] = []
    _flatten_modules(template.modules, levels, language, depth=0)
    has_auto = bool(levels) and levels[-1].theme == "auto"
    return ClassifyContract(levels=tuple(levels), has_auto_tail=has_auto)


def _flatten_modules(
    modules: list[SortStructureModule],
    out: list[ThemeLevel],
    language: str,
    depth: int,
) -> None:
    for idx, mod in enumerate(modules):
        key = theme_level_key(mod.theme, mod.custom_label, depth * 10 + idx)
        out.append(
            ThemeLevel(
                key=key,
                theme=mod.theme,
                prompt_instruction=theme_prompt_instruction(mod.theme, mod.custom_label, language),
                max_folders=mod.max_folders,
                overflow_policy=mod.overflow_policy,
                ui_label=mod.custom_label if mod.theme == "custom" else mod.theme,
                custom_label=mod.custom_label,
            )
        )
        if mod.children:
            _flatten_modules(mod.children, out, language, depth + 1)


def structure_system_appendix(contract: ClassifyContract) -> str:
    """System prompt appendix describing structured JSON output."""
    if not contract.levels:
        return ""
    keys = [lv.key for lv in contract.levels if lv.theme != "auto"]
    lines = [
        "\n\n[Sort structure template — extract themed folder segments]\n",
        "Return strict JSON with keys: theme_values (object), auto_tail (string), "
        "confidence, reason, primary_purpose.\n",
        f'theme_values must include these keys: {", ".join(keys)}.\n',
        "Each theme value is a short folder segment name (2–5 words). "
        "Use empty string for a key you cannot determine and lower confidence.\n",
    ]
    for lv in contract.levels:
        if lv.theme == "auto":
            lines.append(
                "After themed segments, auto_tail may hold any remaining path segments "
                "joined by / (optional).\n"
            )
            break
        lines.append(f"- {lv.key}: {lv.prompt_instruction}\n")
    lines.append(
        'Example: {"theme_values":{"country":"France","property":"Villa Rose"},'
        '"auto_tail":"","confidence":0.9,"reason":"Lease","primary_purpose":"property lease"}\n'
    )
    return "".join(lines)


def classify_contract_to_mapping(contract: ClassifyContract) -> dict[str, Any]:
    """JSON-serializable wire form for cloud sort-worker payloads."""
    return {
        "levels": [
            {
                "key": lv.key,
                "theme": lv.theme,
                "prompt_instruction": lv.prompt_instruction,
                "max_folders": lv.max_folders,
                "overflow_policy": lv.overflow_policy,
                "ui_label": lv.ui_label,
                "custom_label": lv.custom_label,
            }
            for lv in contract.levels
        ],
        "has_auto_tail": contract.has_auto_tail,
    }


def classify_contract_from_mapping(data: Any) -> ClassifyContract | None:
    """Rebuild a classify contract from ``classify_contract_to_mapping`` output."""
    if not isinstance(data, dict):
        return None
    raw_levels = data.get("levels")
    if not isinstance(raw_levels, list) or not raw_levels:
        return None
    try:
        levels: list[ThemeLevel] = []
        for lv in raw_levels:
            if not isinstance(lv, dict):
                continue
            levels.append(
                ThemeLevel(
                    key=str(lv["key"]),
                    theme=lv["theme"],
                    prompt_instruction=str(lv["prompt_instruction"]),
                    max_folders=lv.get("max_folders"),
                    overflow_policy=str(lv.get("overflow_policy") or "merge_into_other"),
                    ui_label=str(lv.get("ui_label") or lv["theme"]),
                    custom_label=lv.get("custom_label"),
                )
            )
        if not levels:
            return None
        return ClassifyContract(levels=tuple(levels), has_auto_tail=bool(data.get("has_auto_tail")))
    except (KeyError, TypeError, ValueError):
        return None
