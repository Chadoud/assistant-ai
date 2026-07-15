"""Autonomy policy — what the agent may do on its own vs. what needs a human.

The autonomous loop can now plan and call real tools, so it needs a gate: read-only
and reversible actions run freely; anything that sends, deletes, spends, or controls
the machine is *sensitive* and is withheld for confirmation unless explicitly allowed.
Unknown tools fail **closed** (treated as sensitive), so new tools are safe by default.

Risk tiers are defined in ``tool_registry.risk_tiers`` (single source of truth).
"""

from __future__ import annotations

from dataclasses import dataclass

from tool_registry.risk_tiers import Risk, classify

__all__ = ["Risk", "classify", "AutonomyPolicy", "Decision"]


@dataclass
class Decision:
    allowed: bool
    risk: Risk
    reason: str


@dataclass
class AutonomyPolicy:
    """Decides whether a tool call may run without a human in the loop."""

    allow_sensitive: bool = False  # when True, the user has pre-authorized side effects

    def check(self, tool: str, args: dict | None = None) -> Decision:
        risk = classify(tool, args)
        if risk is Risk.BLOCKED:
            return Decision(False, risk, f"{tool!r} cannot run inside an autonomous plan.")
        if risk is Risk.SENSITIVE and not self.allow_sensitive:
            return Decision(
                False, risk,
                f"{tool!r} has side effects and needs your confirmation before I run it.",
            )
        return Decision(True, risk, "")
