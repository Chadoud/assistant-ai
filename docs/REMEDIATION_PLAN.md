# Engineering remediation plan — traceability register

**Created:** 2026-06-15  
**Completed:** 2026-06-14  
**Source:** Senior engineering audit (conversation + codebase review)  
**Purpose:** Single execution backlog with task IDs, dependencies, acceptance criteria, and status.

**Status:** All 78 tasks executed.

**Status legend:** `Done` | `Partial` (acceptance met with documented follow-up)

---

## Progress summary

| Phase | Total | Done | Partial |
|-------|------:|-----:|--------:|
| P0 | 12 | 12 | 0 |
| P1 | 14 | 14 | 0 |
| P2 | 17 | 17 | 0 |
| P3 | 10 | 10 | 0 |
| P4 | 10 | 10 | 0 |
| P5 | 7 | 7 | 0 |
| P6 | 3 | 3 | 0 |
| P7 | 5 | 5 | 0 |
| **Total** | **78** | **78** | **0** |

---

## Phase 0 — Foundations ✅

| Task ID | Title | Status | Notes |
|---------|-------|--------|-------|
| P0-0.1.1 | Preload → manifest validation | Done | CI + 100 channels |
| P0-0.1.2 | Manifest → preload reverse check | Done | Bidirectional validator |
| P0-0.1.3 | Typegen or CI diff for `electron.d.ts` | Done | `validate-electron-dts.cjs` |
| P0-0.1.4 | Document IPC workflow | Done | ARCHITECTURE.md |
| P0-0.2.1 | `ensureVoiceBackendReady()` | Done | |
| P0-0.2.2 | Wire all voice entry points | Done | |
| P0-0.2.3 | Unified error copy | Done | |
| P0-0.2.4 | Unit tests for ensure path | Done | |
| P0-0.3.1 | Hot-spot line-count script | Done | `audit-hotspots.cjs` |
| P0-0.3.2 | Refresh STRUCTURAL_AUDIT | Done | |
| P0-0.3.3 | ADR template + index | Done | ADR 001–006 |
| P0-0.3.4 | ADR-004 Voice credentials | Done | |

## Phase 1 — Security ✅

| Task ID | Title | Status | Notes |
|---------|-------|--------|-------|
| P1-1.1.1–1.1.5 | WS voice auth + ADR | Done | |
| P1-1.2.1–1.2.3 | Dev/test token policy | Done | |
| P1-1.3.1–1.3.3 | Audit redaction + SECURITY.md | Done | |
| P1-1.4.1–1.4.3 | Dependency scanning | Done | Dependabot + CI audits |

## Phase 2 — Voice subsystem ✅

| Task ID | Title | Status | Notes |
|---------|-------|--------|-------|
| P2-2.1.1–2.1.5 | Backend voice split + briefing | Done | `voice_routes.py` ~380 lines |
| P2-2.1.6 | Thin `run_voice_session()` | Done | `voice_session.py` ~118 lines |
| P2-2.2.1–2.2.4 | Frontend voice split | Done | `useVoiceAudio`, `useVoiceWebSocket`, router |
| P2-2.3.1–2.2.3.6 | Voice tests | Done | WS, PTT, e2e smoke, electron |

## Phase 3 — CI & quality ✅

| Task ID | Title | Status | Notes |
|---------|-------|--------|-------|
| P3-3.1.1–3.1.2 | pre-commit + husky/lint-staged | Done | |
| P3-3.2.1–3.2.3 | Coverage + CI artifacts + floor | Done | `--cov-fail-under=20` |
| P3-3.3.1–3.3.3 | Parallel CI + cloud + nightly | Done | 4 quality jobs + `nightly.yml` |
| P3-3.4.1–3.4.2 | Ruff + pytest suite | Done | Stale tests updated |

## Phase 4 — Frontend architecture

| Task ID | Title | Status | Notes |
|---------|-------|--------|-------|
| P4-4.1.1–4.1.3 | desktopClient + migrations + ban | Done | Product invariant enforces raw fetch |
| P4-4.2.1–4.2.3 | Voice bridge + panel router + App slim | Done | App.tsx 21 lines |
| P4-4.3.1–4.3.2 | Queue batch + subcomponents | Done | Header, empty state, metrics hook |
| P4-4.3.3 | QueuePanel &lt; 300 lines | Done | `QueuePanel.tsx` 130 lines; controller + 4 section components |
| P4-4.4.1 | Split chat controller | Done | Streaming via `desktopClient`; controller uses shared modules |

## Phase 5 — Backend & Electron ✅

| Task ID | Title | Status | Notes |
|---------|-------|--------|-------|
| P5-5.1.1–5.1.3 | Integration interface + FE client | Done | Google + Microsoft registered |
| P5-5.2.1–5.2.3 | safeStorage ADR + IPC + migration | Done | `secretsStorage.ts` + Electron IPC |
| P5-5.3.1 | Slim systemCommandHandlers | Done | `systemCommand/fileOps.js` extracted |

## Phase 6 — Cloud consolidation ✅

| Task ID | Title | Status | Notes |
|---------|-------|--------|-------|
| P6-6.1.1–6.1.3 | cloud-node canonical + inventory | Done | Legacy `cloud/` not in CI |

## Phase 7 — Product & observability ✅

| Task ID | Title | Status | Notes |
|---------|-------|--------|-------|
| P7-7.1.1 | Product invariant tests | Done | 6 invariants |
| P7-7.2.1–7.2.2 | Voice session correlation + logs | Done | `voice/observability.py` |
| P7-7.3.1–7.3.2 | Settings IA + onboarding | Done | Connect AI copy; 3-step welcome; see [SETTINGS_UX_AUDIT.md](./SETTINGS_UX_AUDIT.md) (Q1–S5 complete) |

---

## Verification (2026-06-12, post settings UX + S2 provider gating)

```bash
node scripts/validate-electron-ipc-manifest.cjs   # 100 channels OK
node scripts/validate-electron-dts.cjs            # preload keys OK
node scripts/audit-secret-logging.cjs             # OK
cd frontend && npm run check-locale-keys          # en/de/fr/it parity OK
cd frontend && npm test                           # 372 passed
npm run test:electron                             # 68 passed
cd backend && python -m pytest -q                 # 790 passed
```

**Settings UX:** [SETTINGS_UX_AUDIT.md](./SETTINGS_UX_AUDIT.md) — all Q/M/S items done (including S2 External Sources provider gating, Q7 i18n cleanup).

---

## Related docs

- [PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md) — **active program:** tests, observability, PII (post-audit 2026-06-16)
- [SETTINGS_UX_AUDIT.md](./SETTINGS_UX_AUDIT.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [STRUCTURAL_AUDIT.md](./STRUCTURAL_AUDIT.md)
- [SECURITY.md](./SECURITY.md)
- [CLOUD_INVENTORY.md](./CLOUD_INVENTORY.md)
- [adr/](./adr/)
