"""Bounded initiative — propose next actions, but never act on the risky ones alone.

This is the agent's proactive layer. Registered *proposers* read the world snapshot
and return candidate actions; every candidate is then gated by the autonomy policy.
Safe candidates may be marked auto-runnable; sensitive ones are returned as suggestions
that explicitly require the user's confirmation. Nothing here executes a tool — it only
surfaces what the agent *could* do next, keeping a human in control of side effects.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Callable

from .policy import AutonomyPolicy, Risk
from .world import snapshot

logger = logging.getLogger(__name__)

# A proposer maps a world snapshot to candidate actions.
ProposerFn = Callable[[dict[str, Any]], list[dict[str, Any]]]

_proposers: list[ProposerFn] = []


@dataclass
class Suggestion:
    """A proposed next action, gated by policy."""

    title: str
    rationale: str
    tool: str | None
    args: dict[str, Any] = field(default_factory=dict)
    risk: str = Risk.SENSITIVE.value
    requires_confirmation: bool = True

    def as_dict(self) -> dict[str, Any]:
        return {
            "title": self.title,
            "rationale": self.rationale,
            "tool": self.tool,
            "args": self.args,
            "risk": self.risk,
            "requires_confirmation": self.requires_confirmation,
        }


def register_proposer(fn: ProposerFn) -> None:
    """Register a proposer that turns a world snapshot into candidate actions."""
    _proposers.append(fn)


def _gate(candidate: dict[str, Any], policy: AutonomyPolicy) -> Suggestion | None:
    """Turn a raw candidate into a policy-gated suggestion, dropping blocked ones."""
    tool = candidate.get("tool")
    args = candidate.get("args") if isinstance(candidate.get("args"), dict) else {}
    title = str(candidate.get("title") or tool or "Proposed action").strip()
    rationale = str(candidate.get("rationale") or "").strip()

    if not tool:  # pure suggestion with no tool is always advisory/safe
        return Suggestion(title, rationale, None, {}, Risk.SAFE.value, requires_confirmation=False)

    decision = policy.check(tool, args)
    if decision.risk is Risk.BLOCKED:
        return None
    return Suggestion(
        title=title,
        rationale=rationale or decision.reason,
        tool=tool,
        args=args,
        risk=decision.risk.value,
        # Safe actions may auto-run; sensitive ones always need confirmation.
        requires_confirmation=not decision.allowed or decision.risk is Risk.SENSITIVE,
    )


def _repair_failures(snap: dict[str, Any]) -> list[dict[str, Any]]:
    """Default proposer: if recent runs failed, suggest reviewing them (safe, advisory)."""
    failures = (snap.get("memory") or {}).get("recent_failures") or []
    if not failures:
        return []
    return [{
        "title": "Review recent failed tasks",
        "rationale": f"{len(failures)} recent task(s) failed; reviewing them may unblock progress.",
        "tool": None,
    }]


register_proposer(_repair_failures)


def suggest(
    *,
    world: dict[str, Any] | None = None,
    policy: AutonomyPolicy | None = None,
    max_suggestions: int = 5,
) -> list[Suggestion]:
    """Gather candidates from all proposers and return policy-gated suggestions.

    :param world: optional pre-built world snapshot (defaults to a fresh one).
    :param policy: autonomy policy (defaults to confirmation-required for side effects).
    :param max_suggestions: cap on returned suggestions.
    """
    snap = snapshot() if world is None else world
    policy = policy or AutonomyPolicy(allow_sensitive=False)

    suggestions: list[Suggestion] = []
    for proposer in _proposers:
        try:
            candidates = proposer(snap)
        except Exception as exc:  # noqa: BLE001
            logger.warning("proposer failed: %s", exc)
            continue
        for candidate in candidates or []:
            gated = _gate(candidate, policy)
            if gated is not None:
                suggestions.append(gated)
            if len(suggestions) >= max_suggestions:
                return suggestions
    return suggestions
