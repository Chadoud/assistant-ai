# ADR-012: User provider routing for assistant

## Status

Accepted (2026-06-18) — Phase 0 of [ASSISTANT_RESTRUCTURE_PLAN.md](../ASSISTANT_RESTRUCTURE_PLAN.md)

## Context

`plan_and_execute` and chat relay defaulted to Anthropic in the reasoning chain while users selected Gemini-only in Settings.

## Decision

- User Settings `aiProvider` + `chatModel` (+ API key / base URL) are passed as `preferred` on every Conductor call.
- Voice sessions relay provider via `provider_context` / WebSocket `provider_relay`.
- HTTP 404 / invalid model errors are failover-eligible (`is_failover_error`), same as rate limits.
- Env API keys are fallbacks when the user has not configured a provider key.

## Consequences

- `ASSISTANT_PROVIDER_CONTEXT` gates injection (default on; set `=0` to disable).
- Tests: `test_provider_context_failover.py`, `test_complete_failover_on_404_model`.
