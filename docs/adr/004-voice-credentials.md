# ADR-004: Voice vs Chat Gemini Credentials

## Status

Accepted

## Context

EXO uses Gemini in two paths:

1. **Text chat / assistant streaming** — the renderer sends `provider`, `model`, `api_key`, and optional `base_url` on each HTTP request ([`assistant_routes.py`](../../backend/routes/assistant_routes.py), [`resolveChatProviderCredentials`](../../frontend/src/utils/resolveChatProviderCredentials.ts)). The backend resolves credentials per request and never requires a process-wide key for chat to work.

2. **Voice (Gemini Live)** — the backend opens a long-lived WebSocket to Google from [`voice_session.py`](../../backend/voice_session.py). That client reads **`GEMINI_API_KEY` from the Python process environment**, not from per-request HTTP bodies. OAuth tokens for briefing tools are relayed separately over the voice WebSocket (`token_relay`).

Users configure Gemini once in Settings → AI Provider. If only the in-memory chat path is populated, voice fails with “GEMINI_API_KEY not configured” even though chat works.

## Decision

| Path | Credential source | Sync required? |
|------|-------------------|----------------|
| Chat / agent HTTP | Per-request body (`api_key` from settings) | No |
| Voice Live session | `os.environ["GEMINI_API_KEY"]` in backend process | Yes — before opening `/ws/voice` |
| Env-based tools (web search, screen capture, sort vision fallbacks) | Same env var | Yes when Gemini is the active provider |

**Sync pipeline:**

1. Renderer reads the Gemini key from `AppSettings` ([`resolveGeminiApiKeyFromSettings`](../../frontend/src/utils/syncGeminiKeyToBackend.ts)).
2. Renderer calls `POST /ai/set-key` with `X-App-Token` ([`pushProviderKeyToBackend`](../../frontend/src/utils/syncGeminiKeyToBackend.ts)) → backend upserts `GEMINI_API_KEY` in `backend/.env` and the running process.
3. Before voice start, call [`ensureVoiceBackendReady`](../../frontend/src/voice/ensureVoiceBackendReady.ts): require Settings/safeStorage connected ([`isGeminiConnectedInSettings`](../../frontend/src/utils/geminiConnection.ts)) → sync if needed → `GET /voice/status` until `ready: true`.
4. On app ready (and before backend spawn), migrate orphan plaintext keys from userData `.env` and (dev) `backend/.env` into safeStorage when missing — so chat and voice share one user-facing source.

All voice entry points (conversation mic, push-to-talk, settings test, auto-start on launch) must use the same helper — no duplicate one-off sync effects.

## Consequences

- **Settings / safeStorage is the single user-facing place** to add or rotate a Gemini key; voice and chat share the same readiness gate ([`isGeminiConnectedInSettings`](../../frontend/src/utils/geminiConnection.ts)).
- **Orphan `GEMINI_API_KEY` in `backend/.env` alone must not unlock voice** while chat still shows “Connect Gemini.”
- **Backend restart** reloads env from safeStorage injection + sync; the renderer re-syncs on the next voice attempt or app focus if the in-process env was stale.
- Chat can still work in a bare browser against a backend with no env key when Settings holds a key; voice cannot until sync succeeds.
- Packaged builds may hydrate a secret **mask** into Settings; that counts as connected for readiness without exposing the raw key to XSS in the renderer.
