"""Structured vision extraction schema for degraded scan filing."""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


class StructuredVisionExtract(BaseModel):
    """JSON fields returned by structured vision on photographed documents."""

    doc_kind: str = Field(default="unknown", max_length=80)
    issuer_country: str | None = Field(default=None, max_length=60)
    property_cues: list[str] = Field(default_factory=list, max_length=8)
    subject_cues: list[str] = Field(default_factory=list, max_length=8)
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)

    @field_validator("doc_kind", "issuer_country", mode="before")
    @classmethod
    def _strip_optional_str(cls, v: object) -> object:
        if v is None:
            return None
        if isinstance(v, str):
            s = v.strip()
            return s if s else None
        return v

    @field_validator("property_cues", "subject_cues", mode="before")
    @classmethod
    def _cap_cue_list(cls, v: object) -> list[str]:
        if not isinstance(v, list):
            return []
        out: list[str] = []
        for item in v[:8]:
            if isinstance(item, str) and item.strip():
                out.append(item.strip()[:120])
        return out

    def to_excerpt_block(self) -> str:
        """Compact [Structured] block for briefing/classify excerpts."""
        lines = [f"doc_kind: {self.doc_kind}"]
        if self.issuer_country:
            lines.append(f"issuer_country: {self.issuer_country}")
        if self.property_cues:
            lines.append(f"property_cues: {', '.join(self.property_cues[:6])}")
        if self.subject_cues:
            lines.append(f"subject_cues: {', '.join(self.subject_cues[:6])}")
        return "[Structured]\n" + "\n".join(lines)

    def to_signals_dict(self) -> dict:
        return {
            "doc_kind": self.doc_kind,
            "issuer_country": self.issuer_country,
            "property_cues": self.property_cues,
            "subject_cues": self.subject_cues,
            "confidence": self.confidence,
        }
