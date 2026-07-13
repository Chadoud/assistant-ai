"""Connect orchestrator — recall prior failures/skills before OAuth autopilot."""

from __future__ import annotations

import uuid
from typing import Any

from orchestrator.memory import KIND_FAILURE, recall, remember


def prepare_connect_context(provider_id: str, provider_label: str) -> dict[str, Any]:
    """Build connect metadata: id, seeded history from skills, prior failure notes."""
    connect_id = uuid.uuid4().hex[:12]
    goal = f"connect {provider_label} oauth {provider_id}"

    seed_history: list[str] = []
    try:
        from orchestrator.skills import find_skill

        skill = find_skill(goal)
        if skill is not None:
            for step in skill.plan[:6]:
                if isinstance(step, dict):
                    seed_history.append(str(step.get("reason") or step.get("tool") or step))
    except Exception:  # noqa: BLE001 — skills are optional enrichment
        pass

    episodes = recall(f"{provider_label} connect oauth", k=2, kinds=[KIND_FAILURE])
    prior_failures = [e.content for e in episodes[:2]]

    return {
        "connect_id": connect_id,
        "seed_history": seed_history,
        "prior_failures": prior_failures,
    }


def record_connect_outcome(
    provider_id: str,
    provider_label: str,
    *,
    success: bool,
    detail: str = "",
) -> None:
    """Store episodic memory after a connect attempt."""
    if success:
        remember(
            f"Connected {provider_label} successfully.",
            kind="episode",
            tags=[provider_id, "connect"],
        )
        return
    remember(
        f"Connect {provider_label} failed: {detail or 'unknown'}",
        kind=KIND_FAILURE,
        tags=[provider_id, "connect"],
        importance=1.5,
    )
