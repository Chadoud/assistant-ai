"""Ring buffer of recent voice turn diagnostics for logs and debug export."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class VoiceTurnTraceEntry:
    """One completed or tool-bearing voice turn."""

    commit_reason: str
    stt_chunk_count: int
    canonical_at_tool: str
    canonical_at_turn_complete: str
    tool_name: str | None = None
    tool_operation: str | None = None
    tool_ok: bool | None = None
    tool_error: str | None = None
    stt_race: bool = False
    enriched_summary: str | None = None
    enriched_start: str | None = None
    deferred_tool_reason: str | None = None
    user_drop_reason: str | None = None
    confirm_state: str | None = None
    title_source: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class VoiceTurnTraceRing:
    """Keep the last N turn traces per session."""

    _entries: list[VoiceTurnTraceEntry] = field(default_factory=list)
    max_size: int = 5

    def push(self, entry: VoiceTurnTraceEntry) -> None:
        self._entries.append(entry)
        if len(self._entries) > self.max_size:
            self._entries = self._entries[-self.max_size :]

    def recent(self, limit: int = 3) -> list[dict[str, Any]]:
        return [e.to_dict() for e in self._entries[-limit:]]
