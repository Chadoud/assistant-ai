# ADR-005: WebSocket Voice App-Token Authentication

## Status

Accepted

## Context

The local FastAPI server binds to `127.0.0.1:7799`. HTTP routes are protected by `AppTokenMiddleware`, which requires `X-App-Token` matching `EXOSITES_APP_TOKEN` ([`backend/main.py`](../../backend/main.py), [`app_auth.py`](../../backend/app_auth.py)).

WebSocket handshakes do not carry custom headers reliably from browser `WebSocket` APIs. Before this decision, `/ws/voice` accepted connections without validating the app token, so any local process could open a voice session if it knew the port.

Electron generates a per-run random token in [`backendProcess.js`](../../electron/backendProcess.js) and exposes it to the renderer via `app:getBackendToken` IPC ([`frontend/src/api/client.ts`](../../frontend/src/api/client.ts)).

## Decision

| Layer | Mechanism |
|-------|-----------|
| Token generation | 32-byte hex secret per backend spawn; `EXOSITES_APP_TOKEN` env on child process |
| HTTP | `X-App-Token` header on every non-exempt path |
| WebSocket `/ws/voice` | Query param `?token=<EXOSITES_APP_TOKEN>` (primary); fallback `X-App-Token` header if present |
| Validation timing | **Before** `ws.accept()` — reject with close code `4401` and reason `Unauthorized` |
| Auth disabled | Only when `EXOSITES_APP_TOKEN` is unset **or** `EXOSITES_INSECURE_LOCAL=1` (explicit pytest / debug escape hatch) |

**Client wiring** ([`useVoiceSession.ts`](../../frontend/src/hooks/useVoiceSession.ts)):

```text
ws://127.0.0.1:7799/ws/voice?memory=1&startup=1&token=<appToken>&session_id=<uuid>
```

**Server wiring** ([`voice_routes.py`](../../backend/routes/voice_routes.py)):

1. Read `token` query param or `X-App-Token` header.
2. If `app_token_auth_enabled()` and `validate_app_token` fails → close without accepting.
3. Only then `await ws.accept()` and process frames (including `token_relay` for OAuth).

## Consequences

- Other localhost processes cannot drive voice without the per-run secret held in Electron main.
- Token appears in WebSocket URL — acceptable on loopback; not sent to remote hosts.
- Tests set `EXOSITES_APP_TOKEN` and connect with `?token=` ([`test_voice_ws_auth.py`](../../backend/tests/test_voice_ws_auth.py)).
- Bare `uvicorn` dev without Electron must set `EXOSITES_INSECURE_LOCAL=1` or provide a matching token manually.
