# ADR-010: Voice turn commit contract

## Status

Accepted (2026-06-18) — Phase 0 of [ASSISTANT_RESTRUCTURE_PLAN.md](../ASSISTANT_RESTRUCTURE_PLAN.md)

## Context

User bubbles were dropped or duplicated when client and server both filtered transcripts. Assistant recap echoes leaked into user history.

## Decision

Canonical `TurnCommitResult` from `backend/services/turn/service.py`:

- `user_text`, `assistant_text` — normalized committed strings
- `user_committed` — whether a user bubble should appear
- `drop_reason` — `junk` | `echo` | `empty` | null
- `user_text_raw` — original STT when dropped (debug only)
- `tool_meta` — optional tool trace

Rules:

1. Only `turn_complete` commits user bubbles (not partial STT).
2. Client uses `serverTurn` when present — no re-filtering of committed text.
3. Client dedupe of assistant bubbles is cosmetic (exact/near-identical recaps).
4. Echo guard uses prior assistant lines only (strict substring bleed).

Golden fixture: `backend/tests/fixtures/voice_transcript_golden.json` synced with frontend copy; CI test enforces parity.

## Consequences

- `voiceEchoGuard.ts` and `voiceTranscriptQuality.ts` are deprecated; legacy path only when `serverTurn` absent.
- See [VOICE.md](../VOICE.md) for protocol; implementation in `services/turn/`.
