# Security threat model — EXO desktop

**Last updated:** 2026-07-15  
**Scope:** Local Electron app + Python backend on loopback. Cloud relay and mobile sync have additional surfaces documented in ADR-001–003.  
**Hardening epic:** [SECURITY_HARDENING_PLAN.md](./SECURITY_HARDENING_PLAN.md). Agent tool tiers: [AGENT_TOOL_THREAT_MODEL.md](./AGENT_TOOL_THREAT_MODEL.md).

This document describes trust boundaries and known risks. Implementation tasks live in the hardening plan (M0–M4).

---

## Trust boundaries

### Localhost API (`127.0.0.1:7799`)

The backend is intended for the EXO desktop shell only — not a network-facing service.

| Control | Purpose |
|---------|---------|
| Bind to loopback | No remote network access by default |
| `EXOSITES_APP_TOKEN` | Per-run secret from Electron main; required on HTTP (`X-App-Token`) when auth is enabled |
| Voice WebSocket | Header `X-App-Token` or first-frame `app_auth` (short-lived ticket preferred). **No** `?token=` query auth |
| CORS allowlist | Renderer origin only ([`backend/main.py`](../backend/main.py)) |

**Residual same-user risk:** Any process running as the **same OS user** can reach `127.0.0.1`, read the Electron process environment, attach a debugger, or read files under the user’s profile / `userData`. The app token and path guards reduce *casual* abuse (scripts, other apps without host compromise) but are **not** a substitute for OS-level isolation. Malware already running as that user is **out of scope**.

**Dev escape hatch:** `EXOSITES_INSECURE_LOCAL=1` disables token checks for bare pytest/uvicorn — never enable in packaged builds (packaged Electron strips/ignores it).

See [ADR-005](./adr/005-websocket-auth.md).

---

## Renderer XSS

The UI is a React renderer with `contextIsolation` and a narrow preload bridge ([`electron/preload.js`](../electron/preload.js)).

| Risk | Mitigation |
|------|------------|
| Stored XSS in chat / markdown | Sanitize user-generated HTML; avoid `dangerouslySetInnerHTML` without a vetted pipeline |
| XSS → steal provider keys / app token | **M2.3:** renderer does **not** receive the durable app token or raw secrets. `secrets:get` returns a mask only; HTTP uses main-process `backend:http`; voice uses short-lived tickets (`voiceMintWsAuthTicket`) |
| XSS → call `window.electronAPI` | Preload exposes fixed IPC methods only; no arbitrary Node access |

Provider keys and OAuth material live in Electron **safeStorage** (main process), not in renderer `localStorage` as durable secret storage.

---

## Secrets at rest

| Secret | Storage today | Notes |
|--------|---------------|-------|
| Gemini / OpenAI / other provider keys | Electron `safeStorage` via IPC; backend may receive mirrored env for the child process | Renderer sees masked status only |
| `EXOSITES_APP_TOKEN` | Electron main process memory only | Not returned to renderer; HTTP proxied via `backend:http` |
| Voice WS auth | Short-lived tickets minted in main | First-frame `app_auth`; no query token |
| Gmail / integration OAuth tokens | Electron secure storage + backend connector store | Fail closed when `safeStorage` unavailable; see [INTEGRATIONS.md](./INTEGRATIONS.md) |
| Sync master key | Derived from password; ciphertext on relay | [ADR-001](./adr/001-sync-crypto.md) |

**Operational guidance:**

- Do not commit `backend/.env` or paste keys into logs.
- Rotate keys in Settings if a machine is shared or imaged.
- Path allowlists do not grant the entire `$HOME`; `userData` / `settings_secrets_*` are blocked as sort output roots.

Voice credential sync is documented in [ADR-004](./adr/004-voice-credentials.md).

---

## WebSocket authentication

`/ws/voice` validates the app token (or a one-time ticket) via header or first JSON `app_auth` frame. Invalid or missing credentials receive close code `4401`. Query `?token=` is rejected even if the secret is correct.

OAuth credentials for briefing (calendar, mail) arrive **after** auth via `token_relay` JSON frames — they must not be processed on unauthenticated connections.

---

## Dependency and supply chain

Tracked separately: npm/pip audit in CI, Dependabot. Run [QUALITY_GATES.md](./QUALITY_GATES.md) before release. Distribution signing: [DISTRIBUTION.md](./DISTRIBUTION.md).

---

## Related docs

- [ARCHITECTURE.md](./ARCHITECTURE.md) — request flow and IPC
- [adr/README.md](./adr/README.md) — decision index
- [SECURITY_HARDENING_PLAN.md](./SECURITY_HARDENING_PLAN.md) — hardening epic
- [AGENT_TOOL_THREAT_MODEL.md](./AGENT_TOOL_THREAT_MODEL.md) — tool risk tiers
- Root [SECURITY.md](../SECURITY.md) — product privacy / data handling
