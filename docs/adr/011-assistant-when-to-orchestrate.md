# ADR-011: When to use plan_and_execute

## Status

Accepted (2026-06-18) — Phase 0 of [ASSISTANT_RESTRUCTURE_PLAN.md](../ASSISTANT_RESTRUCTURE_PLAN.md)

## Context

The model wrapped single-step calendar and mail ops in `plan_and_execute`, causing Anthropic 404s for Gemini-only users and slow, fragile bulk deletes.

## Decision

Use `plan_and_execute` **only** when the goal needs ≥2 tool domains or an explicit multi-step chain (`then`, `step by step`, `research … then …`).

Never orchestrate:

- Calendar list / create / confirm / delete → `CalendarService` + `google_workspace`
- Single integration read/write → direct tool via `tool_registry`
- App/website builds → `start_codegen_studio`

Enforcement: `CapabilityRouter` in voice `tool_dispatch`; server intent in `POST /assistant/turn` for text.

Bulk calendar delete: `CalendarService.bulk_delete` (loop of `delete_calendar_event`), not a dedicated bulk tool declaration.

## Consequences

- Prompt-only tool choice is insufficient; routing is code.
- Phase 6 will align `/agent/task` visualizer with the same orchestrator (pending).
