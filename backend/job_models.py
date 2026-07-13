"""Typed schemas for persisted job payloads."""

from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from constants import DEFAULT_JOB_LANGUAGE, DEFAULT_OLLAMA_MODEL
from rules import UserRule
from sort_structure.models import SortStructureTemplate
from sort_structure.validate import validate_template


class JobPhase(str, Enum):
    analyzing = "analyzing"
    awaiting_approval = "awaiting_approval"
    applying = "applying"
    paused = "paused"
    cancelled = "cancelled"
    done = "done"


class JobStatus(str, Enum):
    running = "running"
    awaiting_approval = "awaiting_approval"
    paused = "paused"
    cancelled = "cancelled"
    done = "done"


class FileStatus(str, Enum):
    pending = "pending"
    reading = "reading"
    classifying = "classifying"
    review_ready = "review_ready"
    applying = "applying"
    done = "done"
    error = "error"


class JobConfig(BaseModel):
    output_dir: str
    model: str = DEFAULT_OLLAMA_MODEL
    mode: Literal["copy", "move"] = "copy"
    language: str = DEFAULT_JOB_LANGUAGE
    vision_model: str | None = None
    """After classify + safety gates, the first matching glob rule overrides folder or forces review (skip)."""
    rules: list[UserRule] = Field(default_factory=list)
    """If True, apply phase writes no files and records planned paths only."""
    dry_run: bool = False
    """uniquify: append (1), (2), … if name exists — error: fail if dest basename exists."""
    on_collision: Literal["uniquify", "error"] = "uniquify"
    """Optional per-job floor for uncertain-folder routing; falls back to server default."""
    min_confidence: float | None = None
    """Override Tesseract language(s) for this job, e.g. fra+eng. Empty/unset uses server env TESSERACT_LANG."""
    tesseract_lang: str | None = None
    """Installed pack codes to use for OCR (whitelist). Empty with no tesseract_lang → all installed packs."""
    tesseract_langs: list[str] | None = None
    """When True, pick a subset of tesseract_langs per page/image via script detection (OSD)."""
    tesseract_auto: bool = True
    sort_system_prompt: str | None = Field(
        default=None,
        max_length=16000,
        description=(
            "Optional user overlay appended to the built-in sort system prompt. "
            "The model should still return JSON with folder_name, confidence, reason, primary_purpose."
        ),
    )
    document_briefing_enable: bool | None = Field(
        default=None,
        description="When set, overrides server DOCUMENT_BRIEFING_ENABLE for this job only.",
    )
    sort_structure_template: SortStructureTemplate | None = Field(
        default=None,
        description="Optional nested folder structure template (themes + caps).",
    )

    @field_validator("sort_structure_template", mode="after")
    @classmethod
    def _validate_sort_structure_template_config(
        cls, v: SortStructureTemplate | None
    ) -> SortStructureTemplate | None:
        if v is not None:
            validate_template(v)
        return v

    @field_validator("sort_system_prompt", mode="before")
    @classmethod
    def _empty_sort_system_prompt_to_none(cls, v: object) -> str | None:
        if v is None:
            return None
        if isinstance(v, str):
            s = v.strip()
            return s if s else None
        return None


class JobFile(BaseModel):
    path: str
    name: str
    """
    For Gmail import jobs: whether this row is the exported message body ``.txt`` or a separate
    downloaded attachment file. Omitted for local or batch Gmail exports without this metadata.
    """
    gmail_staged_part: Literal["message_body", "attachment"] | None = None
    """Source file size on disk (bytes), set when analyze starts; used for usage metering."""
    size_bytes: int = 0
    status: FileStatus = FileStatus.pending
    suggested_folder: str | None = None
    final_folder: str | None = None
    confidence: float = 0.0
    reason: str | None = None
    approved: bool = True
    dest_path: str | None = None
    entry_id: str | None = None
    error: str | None = None
    analysis_excerpt: str | None = None
    extraction_source: str | None = None
    extraction_quality: float | None = None
    extraction_signals: dict = Field(default_factory=dict)
    candidate_scores: list[dict] = Field(default_factory=list)
    decision_reason: str | None = None
    rule_applied_id: str | None = None
    llm_confidence: float | None = None
    rerank_top_score: float | None = None
    llm_folder_name: str | None = None
    classification_disagree: bool | None = None
    """True when rerank/chosen folder differed from the LLM JSON pick before gates."""
    primary_purpose: str | None = None
    """Short phrase from the model for the document’s main role (diagnostics / UX)."""
    llm_reason: str | None = None
    """Model JSON ``reason`` before analyze gates may replace ``reason``."""
    detected_language: str | None = None
    """Heuristic document language hint (OCR / excerpt)."""
    document_briefing: str | None = None
    """Optional condensed filing briefing passed into classify."""
    doc_kind: str | None = None
    """Snake_case document type from filing briefing (e.g. passport_scan)."""
    decision_trace: dict = Field(default_factory=dict)
    """Versioned flags: narrow_tie_break, semantic_rerank_applied, etc."""
    analyze_duration_ms: float | None = Field(
        default=None,
        description="Wall time for extract + classify for this file (milliseconds).",
    )
    analyze_extract_ms: float | None = Field(
        default=None,
        description="Wall time for text extraction only (milliseconds).",
    )
    analyze_briefing_ms: float | None = Field(
        default=None,
        description="Wall time for optional document briefing LLM (milliseconds).",
    )
    analyze_classify_ms: float | None = Field(
        default=None,
        description="Wall time for classify + gates (milliseconds).",
    )
    structure_values: dict[str, str] = Field(default_factory=dict)
    structure_path_provisional: str | None = None
    structure_cap_rewritten: bool = False


class JobRecord(BaseModel):
    id: str
    session_id: str
    phase: JobPhase = JobPhase.analyzing
    status: JobStatus = JobStatus.running
    total: int = 0
    completed: int = 0
    last_processed_index: int = -1
    pause_requested: bool = False
    cancel_requested: bool = False
    created_at: float = Field(default=0.0)
    updated_at: float = Field(default=0.0)
    error: str | None = None
    worker_active: bool = False
    config: JobConfig
    files: list[JobFile] = Field(default_factory=list)

