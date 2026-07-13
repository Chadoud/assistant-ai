"""Pydantic schemas for sort structure templates."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

SortThemeId = Literal[
    "auto",
    "document_type",
    "country",
    "language",
    "year",
    "person",
    "organization",
    "property",
    "project",
    "work",
    "custom",
]

OverflowPolicy = Literal["merge_into_other", "send_to_uncertain"]


class SortStructureModule(BaseModel):
    id: str = ""
    theme: SortThemeId = "auto"
    custom_label: str | None = Field(default=None, max_length=80)
    max_folders: int | None = Field(default=None, ge=1, le=99)
    overflow_policy: OverflowPolicy = "merge_into_other"
    children: list[SortStructureModule] = Field(default_factory=list)

    @field_validator("custom_label", mode="before")
    @classmethod
    def _blank_custom_label(cls, v: object) -> str | None:
        if v is None:
            return None
        if isinstance(v, str):
            s = v.strip()
            return s if s else None
        return None


class SortStructureTemplate(BaseModel):
    version: Literal[1] = 1
    enabled: bool = False
    modules: list[SortStructureModule] = Field(default_factory=list)
