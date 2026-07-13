# ADR-006: Settings Secrets — safeStorage Migration

## Status

Accepted — **Implemented** (2026-06-16, PR production-readiness program)

## Context

Provider API keys (Gemini, OpenAI, Anthropic, custom base URLs) live in renderer `localStorage` via [`useAppSettings.ts`](../../frontend/src/hooks/useAppSettings.ts) and [`SETTINGS_STORAGE_KEY`](../../frontend/src/constants.ts). Any XSS in the renderer can read those keys in plaintext.

Integration OAuth tokens and connector client secrets use Electron `safeStorage` in the main process ([`electron/integrations/storage.js`](../../electron/integrations/storage.js), [`notionClientStore.js`](../../electron/integrations/notionClientStore.js), [`slackClientStore.js`](../../electron/integrations/slackClientStore.js)). **Fail-closed:** when OS encryption is unavailable, new tokens are not written (same as settings secrets). Cloud account sessions follow the same pattern ([`electron/cloudAuth.js`](../../electron/cloudAuth.js)).

The voice/chat credential sync pipeline ([ADR-004](./004-voice-credentials.md)) copies the Gemini key from settings into `backend/.env` via `POST /ai/set-key`. That path works today but depends on keys being readable in the renderer.

[SECURITY.md](../SECURITY.md) tracks this as audit finding A5 (P5-5.2.*).

## Decision

| Concern | Today | Target |
|---------|-------|--------|
| AI provider keys in settings | `localStorage` (renderer) | Main-process `safeStorage` file under `userData` |
| Non-secret preferences (locale, output dir, model slug) | `localStorage` | Stay in `localStorage` — no secret value |
| Backend env sync (`GEMINI_API_KEY`, etc.) | Renderer pushes after read | Main reads from `safeStorage`, exposes masked status to renderer; sync IPC pushes to backend |
| Fallback when `safeStorage` unavailable | N/A for settings keys | Mirror integration storage: base64 + `plain: true` flag; warn once in logs |

**IPC surface (planned, P5-5.2.2):**

- `settings:getProviderSecretsStatus` — which providers have keys stored (boolean/masked tail only; never full key to renderer).
- `settings:setProviderSecret` / `settings:clearProviderSecret` — write/clear in main only.
- `settings:getProviderSecretForSync` — **main-only** helper used before `POST /ai/set-key`; not exposed on preload.

**Migration (planned, P5-5.2.3):**

1. On first launch after upgrade, main reads legacy `localStorage` snapshot (one-time IPC from renderer after hydrate) and writes keys into `safeStorage`.
2. Renderer strips `geminiApiKey`, `chatProviders.*.apiKey`, and related secret fields from persisted settings JSON.
3. Idempotent flag in main (`settings_secrets_migrated_v1`) prevents re-import loops.

**Out of scope for this ADR:**

- Rotating or re-encrypting `backend/.env` on disk (operational guidance stays in SECURITY.md).
- Moving Gmail OAuth tokens (already on main-process storage).

## Consequences

- XSS can no longer exfiltrate raw API keys from `localStorage`; attacker would need IPC abuse (narrower preload surface).
- Settings UI must call IPC to save keys instead of writing them into `AppSettings` state that syncs to `localStorage`.
- [ADR-004](./004-voice-credentials.md) sync pipeline unchanged in shape: renderer/main still ensures `GEMINI_API_KEY` is set before voice; only the **read** path moves to main.
- Tests: unit tests for encrypt/decrypt round-trip in main; renderer tests mock IPC; no real keys in fixtures.
- Follow-up tasks: [REMEDIATION_PLAN.md](../REMEDIATION_PLAN.md) P5-5.2.2, P5-5.2.3.
