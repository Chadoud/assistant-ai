"""
Central registry for the assistant tool catalog (voice Live API + agent executor + chat loop).

Split into focused modules — each tool name maps to an ``actions.*`` handler returning
``{"ok": bool, "data"|"error": ...}``:

- ``handlers``     — name → callable map and the derived name sets.
- ``declarations`` — JSON-Schema tool declarations (Gemini + provider-neutral specs).
- ``dispatch``     — synchronous execution with approval gating and logging.

This package re-exports the previous module-level API so existing
``from tool_registry import ...`` imports keep working unchanged.
"""

from __future__ import annotations

from .assemble import build_live_tools, build_tool_specs
from .dispatch import dispatch_sync
from .handlers import (
    ALL_TOOL_NAMES,
    CONNECTOR_TOOL_NAMES,
    HANDLERS,
    TOOLS_NEEDING_APPROVAL,
    Handler,
)

__all__ = [
    "ALL_TOOL_NAMES",
    "CONNECTOR_TOOL_NAMES",
    "HANDLERS",
    "Handler",
    "TOOLS_NEEDING_APPROVAL",
    "build_live_tools",
    "build_tool_specs",
    "dispatch_sync",
]
