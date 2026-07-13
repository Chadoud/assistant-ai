# ADR-002: Sync Conflict Resolution

## Status

Accepted

## Context

Multiple devices may edit the same second-brain record offline.

## Decision

| Scenario | Resolution |
|----------|------------|
| Concurrent update | LWW on `logical_clock` per `(collection, record_id)` |
| Delete vs update | Tombstone wins when delete clock ≥ update clock |
| Retry duplicate push | Idempotent on `(account_id, collection, record_id, logical_clock)` |
| Loser revision | Stored in local `sync_conflicts` table for user review |

## Consequences

- Simple, debuggable; no CRDT complexity in v1
- Users may rarely see conflict inbox in Settings → Sync
