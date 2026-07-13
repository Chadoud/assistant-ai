# Security threat model — EXO desktop

**Last updated:** 2026-06-15  
**Scope:** Local Electron app + Python backend on loopback. Cloud relay and mobile sync have additional surfaces documented in ADR-001–003.

This document describes trust boundaries and known risks. Implementation tasks live in [REMEDIATION_PLAN.md](./REMEDIATION_PLAN.md) Phase 1.

---

## Trust boundaries

### Localhost API (`127.0.0.1:7799`)

The backend is intended for the EXO desktop shell only — not a network-facing service.

| Control | Purpose |
|---------|---------|
| Bind to loopback | No remote network access by default |
| `EXOSITES_APP_TOKEN` | Per-run secret from Electron main; required on HTTP (`X-App-Token`) and voice WebSocket (`?token=`) when auth is enabled |
| CORS allowlist | Renderer origin only ([`backend/main.py`](../backend/main.py)) |

**Residual risk:** Any process on the same machine can reach `127.0.0.1`. The app token reduces casual abuse (curl scripts, other apps) but is not a substitute for OS-level isolation. Treat malware on the host as out of scope.

**Dev escape hatch:** `EXOSITES_INSECURE_LOCAL=1` disables token checks for bare pytest/uvicorn — never enable in packaged builds.

See [ADR-005](./adr/005-websocket-auth.md).

---

## Renderer XSS

The UI is a React renderer with `contextIsolation` and a narrow preload bridge ([`electron/preload.js`](../electron/preload.js)).

| Risk | Mitigation |
|------|------------|
| Stored XSS in chat / markdown | Sanitize user-generated HTML; avoid `dangerouslySetInnerHTML` without a vetted pipeline |
| XSS → steal `localStorage` settings | API keys and OAuth state currently live in renderer storage — high impact if script injection succeeds |
| XSS → call `window.electronAPI` | Preload exposes fixed IPC methods only; no arbitrary Node access |

**Planned hardening (P5-5.2):** move provider secrets to Electron `safeStorage` via IPC so XSS cannot read raw keys from `localStorage`.

---

## Secrets at rest

| Secret | Storage today | Notes |
|--------|---------------|-------|
| Gemini / OpenAI / other provider keys | `localStorage` (settings) + synced to `backend/.env` | Plaintext on disk under user profile |
| `EXOSITES_APP_TOKEN` | Electron main process memory only | Not persisted; regenerated each backend spawn |
| Gmail / integration OAuth tokens | Electron secure storage + backend connector store | See [INTEGRATIONS.md](./INTEGRATIONS.md) |
| Sync master key | Derived from password; ciphertext on relay | [ADR-001](./adr/001-sync-crypto.md) |

**Operational guidance:**

- Do not commit `backend/.env` or paste keys into logs.
- Rotate keys in Settings if a machine is shared or imaged.
- Audit log redaction for tool args is tracked as P1-1.3.1.

Voice credential sync is documented in [ADR-004](./adr/004-voice-credentials.md).

---

## WebSocket authentication

`/ws/voice` validates the app token **before** `ws.accept()`. Invalid or missing tokens receive close code `4401`.

OAuth credentials for briefing (calendar, mail) arrive **after** auth via `token_relay` JSON frames — they must not be processed on unauthenticated connections.

---

## Dependency and supply chain

Tracked separately: npm/pip audit in CI (P1-1.4), Dependabot config. Run [QUALITY_GATES.md](./QUALITY_GATES.md) before release.

---

## Related docs

- [ARCHITECTURE.md](./ARCHITECTURE.md) — request flow and IPC
- [adr/README.md](./adr/README.md) — decision index
- [REMEDIATION_PLAN.md](./REMEDIATION_PLAN.md) — security epic backlog
