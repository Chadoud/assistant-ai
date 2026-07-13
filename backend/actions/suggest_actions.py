"""``review_and_suggest`` tool — surface proactive next actions (advisory only).

Reads the agent's world snapshot (recent failures, recent actions) and returns
policy-gated suggestions for what to do next. It NEVER executes anything: sensitive
suggestions are flagged ``requires_confirmation`` so the user stays in control.
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

_MAX_SUGGESTIONS = 5


def review_and_suggest(parameters: dict[str, Any]) -> dict[str, Any]:
    """Return up to a few gated suggestions for the user's next step.

    :param parameters: optional ``max_suggestions`` (1-5).
    :returns: ``{ok, suggestions: [...], world}`` or ``{ok: False, error}``.
    """
    try:
        limit = int(parameters.get("max_suggestions", _MAX_SUGGESTIONS))
    except (TypeError, ValueError):
        limit = _MAX_SUGGESTIONS
    limit = min(max(limit, 1), _MAX_SUGGESTIONS)

    try:
        from orchestrator.initiative import suggest
        from orchestrator.world import snapshot

        world = snapshot()
        suggestions = suggest(world=world, max_suggestions=limit)
        return {
            "ok": True,
            "data": {
                "suggestions": [s.as_dict() for s in suggestions],
                "world": world,
            },
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception("review_and_suggest")
        return {"ok": False, "error": str(exc)}
