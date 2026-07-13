"""Pydantic request/response models shared by FastAPI routes."""

from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

from constants import DEFAULT_JOB_LANGUAGE, DEFAULT_OLLAMA_MODEL, GMAIL_EXPORT_MAX_MESSAGES
from gmail_import import GMAIL_QUERY_DEFAULT_INBOX
from rules import UserRule
from sort_structure.models import SortStructureTemplate
from sort_structure.validate import validate_template


def _validate_optional_sort_structure_template(v: SortStructureTemplate | None) -> SortStructureTemplate | None:
    if v is not None:
        validate_template(v)
    return v


class AnalyzeUploadPayload(BaseModel):
    """Multipart JSON body for ``POST /analyze-upload`` — same options as ``FileJobRequest`` without paths."""

    output_dir: str
    model: str = DEFAULT_OLLAMA_MODEL
    mode: Literal["copy", "move"] = "copy"
    language: str = DEFAULT_JOB_LANGUAGE
    session_id: Optional[str] = None
    vision_model: Optional[str] = None
    rules: list[UserRule] = Field(default_factory=list)
    dry_run: bool = False
    on_collision: Literal["uniquify", "error"] = "uniquify"
    min_confidence: Optional[float] = None
    tesseract_lang: Optional[str] = None
    tesseract_langs: Optional[list[str]] = None
    tesseract_auto: bool = True
    sort_system_prompt: str | None = Field(
        default=None,
        max_length=16000,
        description="Optional user overlay appended to the built-in sort/classify system prompt.",
    )
    document_briefing_enable: Optional[bool] = Field(
        default=None,
        description="When set, overrides server DOCUMENT_BRIEFING_ENABLE for this job only.",
    )
    sort_structure_template: SortStructureTemplate | None = None

    @field_validator("sort_structure_template", mode="after")
    @classmethod
    def _validate_sort_structure_template_upload(
        cls, v: SortStructureTemplate | None
    ) -> SortStructureTemplate | None:
        return _validate_optional_sort_structure_template(v)

    @field_validator("sort_system_prompt", mode="before")
    @classmethod
    def _blank_sort_system_prompt_analyze(cls, v: object) -> str | None:
        if v is None:
            return None
        if isinstance(v, str):
            s = v.strip()
            return s if s else None
        return None


class FileJobRequest(BaseModel):
    file_paths: list[str]
    output_dir: str
    model: str = DEFAULT_OLLAMA_MODEL
    mode: Literal["copy", "move"] = "copy"
    language: str = DEFAULT_JOB_LANGUAGE
    session_id: Optional[str] = None
    vision_model: Optional[str] = None
    rules: list[UserRule] = Field(default_factory=list)
    dry_run: bool = False
    on_collision: Literal["uniquify", "error"] = "uniquify"
    min_confidence: Optional[float] = None
    tesseract_lang: Optional[str] = None
    tesseract_langs: Optional[list[str]] = None
    tesseract_auto: bool = True
    sort_system_prompt: str | None = Field(
        default=None,
        max_length=16000,
        description="Optional user overlay appended to the built-in sort/classify system prompt.",
    )
    document_briefing_enable: Optional[bool] = Field(
        default=None,
        description="When set, overrides server DOCUMENT_BRIEFING_ENABLE for this job only.",
    )
    import_sources: list[str] | None = Field(
        default=None,
        description="Connectors/local paths selected for this run (UI source chips).",
    )
    sort_structure_template: SortStructureTemplate | None = None

    @field_validator("sort_structure_template", mode="after")
    @classmethod
    def _validate_sort_structure_template_file_job(
        cls, v: SortStructureTemplate | None
    ) -> SortStructureTemplate | None:
        return _validate_optional_sort_structure_template(v)

    @field_validator("sort_system_prompt", mode="before")
    @classmethod
    def _blank_sort_system_prompt_file_job(cls, v: object) -> str | None:
        if v is None:
            return None
        if isinstance(v, str):
            s = v.strip()
            return s if s else None
        return None


class ApplyItem(BaseModel):
    path: str
    approved: bool = True
    folder: Optional[str] = None


class ApplyRequest(BaseModel):
    job_id: str
    items: list[ApplyItem]


class UndoRequest(BaseModel):
    entry_id: str


class UndoSessionRequest(BaseModel):
    session_id: str
    """When set, job state is restored to awaiting approval after undo (Sort tab review UI)."""
    job_id: Optional[str] = None


class GmailImportJobRequest(BaseModel):
    """Start a sort job from Gmail-exported ``.txt`` files (same job options as ``FileJobRequest`` without paths)."""

    gmail_query: str = GMAIL_QUERY_DEFAULT_INBOX
    max_messages: int = Field(
        50,
        ge=1,
        le=GMAIL_EXPORT_MAX_MESSAGES,
        description="Attachments only: max attachment files saved. Text or both: max Gmail messages processed.",
    )
    gmail_import_content: Literal["text", "attachments", "both"] = Field(
        "both",
        description="Message body as .txt, attachment files only, or both in one import job.",
    )
    gmail_ui_parameters_json: str | None = Field(
        default=None,
        max_length=4096,
        description="Optional client JSON snapshot of UI scope, cap, and import mode (CSV / debugging).",
    )
    output_dir: str
    model: str = DEFAULT_OLLAMA_MODEL
    mode: Literal["copy", "move"] = "copy"
    language: str = DEFAULT_JOB_LANGUAGE
    session_id: Optional[str] = None
    vision_model: Optional[str] = None
    rules: list[UserRule] = Field(default_factory=list)
    dry_run: bool = False
    on_collision: Literal["uniquify", "error"] = "uniquify"
    min_confidence: Optional[float] = None
    tesseract_lang: Optional[str] = None
    tesseract_langs: Optional[list[str]] = None
    tesseract_auto: bool = True
    sort_system_prompt: str | None = Field(
        default=None,
        max_length=16000,
        description="Optional user overlay appended to the built-in sort/classify system prompt.",
    )
    document_briefing_enable: Optional[bool] = Field(
        default=None,
        description="When set, overrides server DOCUMENT_BRIEFING_ENABLE for this job only.",
    )
    sort_structure_template: SortStructureTemplate | None = None

    @field_validator("sort_structure_template", mode="after")
    @classmethod
    def _validate_sort_structure_template_gmail(
        cls, v: SortStructureTemplate | None
    ) -> SortStructureTemplate | None:
        return _validate_optional_sort_structure_template(v)

    @field_validator("sort_system_prompt", mode="before")
    @classmethod
    def _blank_sort_system_prompt_gmail_import(cls, v: object) -> str | None:
        if v is None:
            return None
        if isinstance(v, str):
            s = v.strip()
            return s if s else None
        return None


class GmailInlineImportOptions(BaseModel):
    """Gmail slice merged into ``POST /analyze/with-sources`` (same job as local paths)."""

    gmail_query: str = GMAIL_QUERY_DEFAULT_INBOX
    max_messages: int = Field(
        50,
        ge=1,
        le=GMAIL_EXPORT_MAX_MESSAGES,
        description="Attachments only: max attachment files saved. Text or both: max Gmail messages processed.",
    )
    gmail_import_content: Literal["text", "attachments", "both"] = Field(
        "both",
        description="Message body as .txt, attachment files only, or both.",
    )
    gmail_ui_parameters_json: str | None = Field(default=None, max_length=4096)


class AnalyzeWithSourcesJobRequest(FileJobRequest):
    """Local (or expanded) paths plus optional Gmail export in one analyze job."""

    gmail: Optional[GmailInlineImportOptions] = None


class DriveStreamStartRequest(BaseModel):
    """
    Start a **progressive** Google Drive import sort: the client lists/imports in waves and
    ``POST /job/{id}/drive-stream-chunk`` appends local paths to one job (same pattern as Gmail streaming).
    ``initial_file_paths`` are optional local paths classified before the first Drive chunk.
    Optional ``gmail`` runs server-side Gmail export **in parallel** with Drive chunks (same job).
    """

    initial_file_paths: list[str] = Field(default_factory=list)
    output_dir: str
    model: str = DEFAULT_OLLAMA_MODEL
    mode: Literal["copy", "move"] = "copy"
    language: str = DEFAULT_JOB_LANGUAGE
    session_id: Optional[str] = None
    vision_model: Optional[str] = None
    rules: list[UserRule] = Field(default_factory=list)
    dry_run: bool = False
    on_collision: Literal["uniquify", "error"] = "uniquify"
    min_confidence: Optional[float] = None
    tesseract_lang: Optional[str] = None
    tesseract_langs: Optional[list[str]] = None
    tesseract_auto: bool = True
    sort_system_prompt: str | None = Field(
        default=None,
        max_length=16000,
        description="Optional user overlay appended to the built-in sort/classify system prompt.",
    )
    document_briefing_enable: Optional[bool] = Field(
        default=None,
        description="When set, overrides server DOCUMENT_BRIEFING_ENABLE for this job only.",
    )
    gmail: Optional[GmailInlineImportOptions] = Field(
        default=None,
        description="Optional Gmail export merged into the same progressive Drive stream job.",
    )
    import_sources: list[str] | None = Field(
        default=None,
        description="Connectors selected in the workspace batch (shown before files are staged).",
    )
    sort_structure_template: SortStructureTemplate | None = None

    @field_validator("sort_structure_template", mode="after")
    @classmethod
    def _validate_sort_structure_template_drive(
        cls, v: SortStructureTemplate | None
    ) -> SortStructureTemplate | None:
        return _validate_optional_sort_structure_template(v)

    @field_validator("sort_system_prompt", mode="before")
    @classmethod
    def _blank_sort_system_prompt_drive_stream(cls, v: object) -> str | None:
        if v is None:
            return None
        if isinstance(v, str):
            s = v.strip()
            return s if s else None
        return None


class DriveStreamChunkRequest(BaseModel):
    """Append locally staged paths from a Drive import wave; set ``ended`` when listing/import is complete."""

    file_paths: list[str] = Field(default_factory=list)
    ended: bool = False
    """Largest file-row count seen so far while listing (for UI; monotonic from the client)."""
    drive_listing_discovered: Optional[int] = None
    """When set, merged into the job’s staging cleanup list (reused Drive download folder from Electron)."""
    browser_staging_dir: str | None = None
    """Cumulative count of Drive files that failed to download."""
    drive_fetch_failures: int | None = None
    """Google Drive file IDs that failed to download - stored so the UI can offer a retry."""
    drive_failed_file_ids: list[str] = Field(default_factory=list)
    """Total non-folder files found in the Drive source before filter/cap (monotonic from the client)."""
    drive_files_in_source: Optional[int] = None


class FolderTreeRequest(BaseModel):
    output_dir: str


class ReassignRequest(BaseModel):
    entry_id: str
    new_folder: str
    output_dir: str


class PullModelRequest(BaseModel):
    model: str = Field(..., max_length=200, pattern=r"^[A-Za-z0-9._:\-/]+$")


class DeletePartialRequest(BaseModel):
    """Digest prefix for one partial blob group (``sha256-`` + 64 hex chars)."""

    digest_prefix: str = Field(..., min_length=10)

