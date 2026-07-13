"""Desktop sort defaults synced from the renderer for voice-triggered sorts."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

from api_schemas import _validate_optional_sort_structure_template
from constants import DEFAULT_JOB_LANGUAGE
from rules import UserRule
from sort_structure.models import SortStructureTemplate

_defaults: "SortDesktopDefaults | None" = None


class SortDesktopDefaults(BaseModel):
    """Sort-tab settings mirrored to the backend for voice tools (no file paths or model)."""

    output_dir: str = ""
    mode: Literal["copy", "move"] = "copy"
    language: str = DEFAULT_JOB_LANGUAGE
    vision_model: Optional[str] = None
    rules: list[UserRule] = Field(default_factory=list)
    on_collision: Literal["uniquify", "error"] = "uniquify"
    min_confidence: Optional[float] = None
    tesseract_lang: Optional[str] = None
    tesseract_langs: Optional[list[str]] = None
    tesseract_auto: bool = True
    sort_system_prompt: str | None = Field(default=None, max_length=16000)
    document_briefing_enable: Optional[bool] = None
    sort_structure_template: SortStructureTemplate | None = None

    @field_validator("sort_structure_template", mode="after")
    @classmethod
    def _validate_sort_structure_template(
        cls, v: SortStructureTemplate | None
    ) -> SortStructureTemplate | None:
        return _validate_optional_sort_structure_template(v)

    @field_validator("sort_system_prompt", mode="before")
    @classmethod
    def _blank_sort_system_prompt(cls, v: object) -> str | None:
        if v is None:
            return None
        if isinstance(v, str):
            s = v.strip()
            return s if s else None
        return None


def set_sort_desktop_defaults(body: SortDesktopDefaults) -> None:
    """Replace in-memory defaults (last POST wins per backend process)."""
    global _defaults
    _defaults = body


def get_sort_desktop_defaults() -> SortDesktopDefaults | None:
    return _defaults


def clear_sort_desktop_defaults_for_tests() -> None:
    global _defaults
    _defaults = None
