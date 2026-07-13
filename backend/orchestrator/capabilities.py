"""Capabilities and their ordered provider relay chains.

A *capability* is a kind of work (chat, deep reasoning, vision, ...). Each maps
to an ordered list of provider ids: the first is preferred, the rest are relays
tried in order when the preferred one is unconfigured, cooling down, or failing.

Chains intentionally end with a LOCAL provider (``ollama``) where one can serve,
so the system degrades but never fully stalls when every cloud key is exhausted.
Only providers that are actually configured (have a key) are used at runtime —
see ``conductor.candidates_for``.
"""

from __future__ import annotations

from enum import Enum


class Capability(str, Enum):
    """Kinds of work the orchestrator can route."""

    CHAT = "chat"            # fast conversational replies / summaries
    REASONING = "reasoning"  # deep multi-step reasoning, coding, planning
    VISION = "vision"        # understand an image / screenshot
    LONG_CONTEXT = "long_context"  # very large inputs


# Preference order per capability. Provider ids match ``llm.registry.PROVIDERS``.
CHAINS: dict[Capability, list[str]] = {
    # Claude is strongest at reasoning/coding; fall back to OpenAI, then Gemini Pro,
    # then local Ollama as the always-available last resort.
    Capability.REASONING: ["anthropic", "openai", "gemini", "ollama"],
    # Fast/cheap first for chat: Gemini Flash, then Claude, OpenAI, local.
    Capability.CHAT: ["gemini", "anthropic", "openai", "ollama"],
    # Vision: Gemini and OpenAI are multimodal; Claude can see too; Ollama last (local).
    Capability.VISION: ["gemini", "openai", "anthropic", "ollama"],
    # Large inputs: Gemini and Claude have the biggest context windows.
    Capability.LONG_CONTEXT: ["gemini", "anthropic", "openai", "ollama"],
}


def chain_for(capability: Capability) -> list[str]:
    """Return the ordered provider chain for a capability (empty if unknown)."""
    return list(CHAINS.get(capability, []))
