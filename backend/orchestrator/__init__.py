"""Multi-provider orchestration: capability routing + self-healing failover.

The orchestrator is the "Conductor" layer that lets the app's connected AI
providers work as one system. It decides which engine handles a capability
(chat, reasoning, vision, ...), tracks each provider's health and rate-limit
state, and relays to the next provider when one is exhausted or failing.

Public surface:
  - ``health``       — token-bucket pacing + circuit breaker + retry parsing.
  - ``capabilities`` — capability constants and ordered provider relay chains.
  - ``conductor``    — pick healthy, key-configured candidates for a capability.
  - ``complete``     — relay-aware one-shot text completion.
  - ``vision``       — relay-aware one-shot image understanding (screen navigation).
"""

from __future__ import annotations

from .agents import orchestrate
from .audit import AuditAdapter, recent_actions, record_action
from .blackboard import Blackboard
from .budget import Budget
from .capabilities import CHAINS, Capability
from .conductor import Candidate, candidates_for
from .health import (
    REGISTRY,
    is_failover_error,
    is_model_failover_error,
    is_transient_error,
    parse_retry_after,
)
from .initiative import Suggestion, suggest
from .memory import Memory, recall, recent, remember
from .policy import AutonomyPolicy, Risk, classify
from .relay_events import publish as publish_relay
from .relay_events import using_sink
from .skills import Skill, find_skill, save_skill
from .vision import VisionError, audit_relay_callback, vision_complete
from .world import register_observer, snapshot

__all__ = [
    "CHAINS",
    "Capability",
    "Candidate",
    "candidates_for",
    "REGISTRY",
    "is_transient_error",
    "is_model_failover_error",
    "is_failover_error",
    "parse_retry_after",
    "orchestrate",
    "Blackboard",
    "Memory",
    "recall",
    "recent",
    "remember",
    "Skill",
    "find_skill",
    "save_skill",
    "AutonomyPolicy",
    "Risk",
    "classify",
    "Budget",
    "AuditAdapter",
    "record_action",
    "recent_actions",
    "Suggestion",
    "suggest",
    "register_observer",
    "snapshot",
    "VisionError",
    "vision_complete",
    "audit_relay_callback",
    "publish_relay",
    "using_sink",
]
