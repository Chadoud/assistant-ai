# ADR-007: Local SQLite at-rest protection

## Status

Accepted

## Context

The desktop app persists jobs, memory, conversations, activity summaries, and product diagnostics in **SQLite files on the user's machine**. Full-database encryption (SQLCipher) adds packaging complexity, key management, and recovery risk for a local-first product where the **OS user account** is already the primary trust boundary.

We still need a written policy for security reviews, GDPR discussions, and store privacy questionnaires.

## Decision

1. **Trust boundary:** Local SQLite is protected by **OS filesystem permissions** (same user session). We do not claim encryption-at-rest inside the DB file for v1.
2. **Sensitive columns:** OAuth tokens and API keys live in **Electron safeStorage** (OS keychain / DPAPI) per ADR-006 — not in SQLite plaintext for settings secrets.
3. **GO SYNC ciphertext:** Sync relay blobs are encrypted **before** upload; local sync cache holds ciphertext + keys in secure storage.
4. **Retention:** Telemetry (90d), activity timeline (14d), cloud crash rows (90d ops cron) — see `SECURITY.md` and `telemetry/retention.py`.
5. **User erasure:** `POST /v1/privacy/wipe-local` + Settings UI clears local stores; cloud account deletion via `DELETE /v1/me`.
6. **Future:** SQLCipher or OS-level FileVault/BitLocker guidance may be revisited if enterprise customers require explicit DB encryption — track as deferred, not blocking consumer launch.

## Consequences

- Honest store privacy copy: data at rest relies on device encryption when the user enables it.
- Faster recovery and simpler backups than per-DB keys.
- Security reviews must not assume ciphertext inside `*.sqlite` for memory/jobs/telemetry.
