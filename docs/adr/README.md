# Architecture Decision Records (ADR)

Lightweight records of significant technical decisions. Number sequentially; do not renumber accepted ADRs.

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [001-sync-crypto.md](./001-sync-crypto.md) | E2E sync cryptography | Accepted |
| [002-sync-conflicts.md](./002-sync-conflicts.md) | Sync conflict resolution | Accepted |
| [003-blob-schema.md](./003-blob-schema.md) | Sync blob schema versioning | Accepted |
| [004-voice-credentials.md](./004-voice-credentials.md) | Voice vs chat Gemini credentials | Accepted |
| [005-websocket-auth.md](./005-websocket-auth.md) | WebSocket voice app-token auth | Accepted |
| [006-settings-secrets.md](./006-settings-secrets.md) | Settings secrets safeStorage migration | Implemented |
| [008-opentelemetry-deferred.md](./008-opentelemetry-deferred.md) | OpenTelemetry deferred | Accepted |
| [009-assistant-conversation-source-of-truth.md](./009-assistant-conversation-source-of-truth.md) | Assistant conversation authority | Accepted |
| [010-assistant-voice-turn-contract.md](./010-assistant-voice-turn-contract.md) | Voice turn commit contract | Accepted |
| [011-assistant-when-to-orchestrate.md](./011-assistant-when-to-orchestrate.md) | When to use plan_and_execute | Accepted |
| [012-assistant-provider-routing.md](./012-assistant-provider-routing.md) | User provider routing for assistant | Accepted |
| [013-calendar-recurring-delete-scope.md](./013-calendar-recurring-delete-scope.md) | Calendar recurring delete scope | Accepted |
| [014-centralized-llm.md](./014-centralized-llm.md) | Centralized LLM inference (Ollama + LiteLLM) | Proposed |

## Template

Copy the block below when adding `00N-short-title.md`.

```markdown
# ADR-00N: Short Title

## Status

Proposed | Accepted | Superseded by ADR-00M

## Context

What problem or constraint forced a decision?

## Decision

The chosen approach — bullets or a short table.

## Consequences

Positive and negative outcomes; follow-up work if any.
```

## When to write an ADR

- Security boundary changes (auth, secrets, trust model)
- Cross-layer contracts (IPC, WebSocket, sync envelope)
- Irreversible or expensive-to-reverse choices

Link new ADRs from [REMEDIATION_PLAN.md](../REMEDIATION_PLAN.md) task notes when they close an audit finding.
