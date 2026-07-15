# ADR-005: WebSocket Voice App-Token Authentication

## Status

Accepted (amended 2026-07-15 — M2.5: no query `?token=`)

## Context

The local FastAPI server binds to `127.0.0.1:7799`. HTTP routes are protected by `AppTokenMiddleware`, which requires `X-App-Token` matching `EXOSITES_APP_TOKEN` ([`backend/main.py`](../../backend/main.py), [`app_auth.py`](../../backend/app_auth.py)).

WebSocket handshakes do not carry custom headers reliably from browser `WebSocket` APIs. Before this decision, `/ws/voice` accepted connections without validating the app token, so any local process could open a voice session if it knew the port.

Electron generates a per-run random token in [`backendProcess.js`](../../electron/backendProcess.js) and exposes it to the renderer via `app:getBackendToken` IPC ([`frontend/src/api/client.ts`](../../frontend/src/api/client.ts)).

## Decision

| Layer | Mechanism |
|-------|-----------|
| Token generation | 32-byte hex secret per backend spawn; `EXOSITES_APP_TOKEN` env on child process |
| HTTP | `X-App-Token` header on every non-exempt path |
| WebSocket `/ws/voice` | **Preferred:** first JSON frame `{"type":"app_auth","token":"..."}` (browser). **Also:** `X-App-Token` header (tests / native clients). **Not accepted:** query `?token=` (leaks to logs) |
| Validation timing | After `ws.accept()` so the client can send `app_auth`; then close `4401` if auth fails |
| Auth disabled | Only when `EXOSITES_APP_TOKEN` is unset **or** `EXOSITES_INSECURE_LOCAL=1` (explicit pytest / debug escape hatch); packaged builds refuse insecure mode |

**Client wiring** ([`useVoiceWebSocket.ts`](../../frontend/src/voice/useVoiceWebSocket.ts)):

```text
ws://127.0.0.1:7799/ws/voice?memory=1&startup=1&session_id=<uuid>
→ first frame: {"type":"app_auth","token":"<appToken>"}
```

**Server wiring** ([`voice_routes.py`](../../backend/routes/voice_routes.py), [`voice_ws_auth.py`](../../backend/voice_ws_auth.py)):

1. `await ws.accept()`.
2. Authenticate via header or first-frame `app_auth`.
3. On failure → close with code `4401` and reason `Unauthorized`.

## Consequences

- Other localhost processes cannot drive voice without the per-run secret.
- Token does not appear in WebSocket URLs (avoids access-log leakage).
- Tests use `X-App-Token` or an `app_auth` frame ([`test_voice_ws_auth.py`](../../backend/tests/test_voice_ws_auth.py)).
- Bare `uvicorn` without Electron must set `EXOSITES_INSECURE_LOCAL=1` or provide a matching token.
