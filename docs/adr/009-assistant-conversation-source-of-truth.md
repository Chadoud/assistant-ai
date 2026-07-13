# ADR-009: Assistant conversation source of truth

## Status

Accepted (2026-06-18) — Phase 0 of [ASSISTANT_RESTRUCTURE_PLAN.md](../ASSISTANT_RESTRUCTURE_PLAN.md)

## Context

Voice and text assistant surfaces duplicated commit policy, calendar confirm state, and prefetch routing across Python and TypeScript. Conflicts produced duplicate bubbles and divergent calendar flows.

## Decision

| Concern | Authority |
|---------|-----------|
| Live chat UI messages | Client (`localStorage` / conversation store) — client wins for display |
| Voice turn commit (junk/echo/drop) | Server `TurnService` at `turn_complete` |
| Calendar draft / confirm | Server `CalendarService` |
| Text chat routing & prefetch | Server `POST /assistant/turn` |
| Memory distillation | Server `/conversations/{id}/distill` — server wins for extraction |

Clients render server payloads; they do not re-run routing regex for text chat when unified turn is enabled.

## Consequences

- New assistant routing belongs in backend services, not `assistantIntent.ts` branches.
- Frontend `classifyIntent` is UI hints only (panel deeplinks, IPC gates).
- Conflict merge UI is deferred — silent client-wins for display remains.
