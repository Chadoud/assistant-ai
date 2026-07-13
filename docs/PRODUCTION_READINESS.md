# Production readiness — tests, observability, PII

**Created:** 2026-06-16  
**Last execution pass:** 2026-06-16 (program close — engineering)  
**Source:** Senior engineering audit (tests · observability · PII / data protection)  
**Purpose:** Living execution register for shipping GO SYNC, mobile beta, and public store builds.

**Companion docs:** [REMEDIATION_PLAN.md](./REMEDIATION_PLAN.md), [QUALITY_GATES.md](./QUALITY_GATES.md), [SECURITY.md](../SECURITY.md), [PRODUCTION_RELEASE.md](./PRODUCTION_RELEASE.md)

**Status legend:** `Not started` | `In progress` | `Done` | `Blocked` | `Deferred`

---

## Program status

| Phase | Focus | Tasks | Done | In progress | Deferred |
|-------|-------|------:|-----:|------------:|---------:|
| **1** | Critical gaps | 6 | **6** | 0 | 0 |
| **1.5** | Compliance & trust | 5 | **5** | 0 | 0 |
| **2** | Operational maturity | 10 | **10** | 0 | 0 |
| **3** | Production-grade ops | 7 | **7** | 0 | 0 |
| **4** | Hardening & hygiene | 12 | **11** | 0 | **1** |
| **Total** | | **40** | **39** | 0 | **1** |

**Engineering:** complete (quality gate green, last run 2026-06-18).  
**Product/legal:** PR-1.5.5 — **Done** (2026-06-25): legitimate-interest diagnostics, objection toggles, export UI, crash purge on delete; supplement in [`legal/app-privacy-legitimate-interest-supplement.md`](./legal/app-privacy-legitimate-interest-supplement.md) for exosites-agency.  
**Deferred (non-blocking):** PR-4.7 OpenTelemetry — [ADR-008](./adr/008-opentelemetry-deferred.md).

---

## What is left (your action only)

| # | Item | Owner | How to close |
|---|------|-------|--------------|
| 1 | Ship desktop build with `LEGAL_TERMS_BUNDLE_VERSION` `2026-06-25-gdpr-li` | Product | Tag `v1.1.5` after merge |
| 2 | *(Optional)* Sentry alert rules in Sentry UI | Ops | [`runbooks/sentry-alerts.md`](./runbooks/sentry-alerts.md) |
| 3 | *(Optional)* DE/IT legal pages on exosites.ch | Product | Agency translations |

Items 3–5 are release hygiene, not register blockers.

---

## Phase 1 — Critical gaps ✅

| ID | Task | Status | Verification |
|----|------|--------|--------------|
| PR-1.1 | Cloud sync relay HTTP tests | **Done** | `cloud-node/test/syncRelay.test.js`, `syncRoutes.test.js` |
| PR-1.2 | Integration action tests | **Done** | `backend/tests/test_google_workspace_tool.py`, `test_microsoft_graph_tool.py` |
| PR-1.3 | Deep health / readiness | **Done** | `GET /ready` in `backend/routes/meta_routes.py`, `backend/health_checks.py` |
| PR-1.4 | Crash ingest failures visible | **Done** | `crashIngestDiagnostics.ts`, tests, no silent catch in `crashBackendIngest.ts` |
| PR-1.5 | ADR-006 API key migration | **Done** | `settingsPersist.ts`, `secretsStorage.ts`, `secretsStore.js` fail-closed, ADR-006 updated |
| PR-1.6 | Cloud account deletion API | **Done** | `DELETE /v1/me`, `cloud-node/lib/accountLifecycle.js` |

---

## Phase 1.5 — Compliance & trust

| ID | Task | Status | Notes |
|----|------|--------|-------|
| PR-1.5.1 | GDPR data-subject bundle | **Done** | Cloud export/delete API + UI; local wipe; telemetry/crash retention (90d) |
| PR-1.5.2 | Harden `backend/.env` | **Done** | `chmod 0o600` in `ai_routes._upsert_env` |
| PR-1.5.3 | safeStorage fail-closed | **Done** | Settings secrets + integration OAuth tokens — no plaintext fallback ([PR-4.4](#phase-4--hardening--hygiene)) |
| PR-1.5.4 | Cloud LLM / voice egress disclosure | **Done** | `settings.aiProviderCloudEgressHint` + Settings UI (en/de/fr/it) |
| PR-1.5.5 | Publish Terms + Privacy | **Done** | Legitimate-interest supplement drafted; in-app objection + export + erasure (2026-06-25). Publish supplement on exosites.ch from [`legal/app-privacy-legitimate-interest-supplement.md`](./legal/app-privacy-legitimate-interest-supplement.md). |

---

## Phase 2 — Operational maturity ✅

| ID | Task | Status | Notes |
|----|------|--------|-------|
| PR-2.1 | Request correlation ID | **Done** | `X-Request-Id` in `frontend/src/api/client.ts` + backend JSON logs |
| PR-2.2 | Structured request logging | **Done** | `backend/request_logging.py` middleware |
| PR-2.3 | Raise coverage gates | **Done** | Backend `--cov-fail-under=25` + `health_checks` in `.github/workflows/build.yml` |
| PR-2.4 | Electron syncWorker tests | **Done** | `electron/syncWorker.test.js` |
| PR-2.5 | Rate-limit cloud auth | **Done** | `cloud-node/lib/authRateLimit.js` |
| PR-2.6 | Cloud-node auth + crash tests | **Done** | `authRateLimit.test.js`, `crashRoutes.test.js` |
| PR-2.7 | Critical React component tests | **Done** | `SettingsPrivacySection.test.tsx`, `ReviewTable.test.tsx`, `reviewTableFilters.test.ts` |
| PR-2.8 | Mobile test minimum | **Done** | `widget_test`, `sync_crypto_test`, `cloud_api_errors_test`, `mobile_crash_reporter_test` |
| PR-2.9 | Mobile crash reporting | **Done** | Opt-in `MobileCrashReporter` + Settings toggle |
| PR-2.10 | Enforce release gate docs | **Done** | `docs/TESTING.md` updated |

---

## Phase 3 — Production-grade ops ✅

| ID | Task | Status |
|----|------|--------|
| PR-3.1 | Distributed tracing | **Done** | v1 = `X-Request-Id` + `request_context.py`; OTel deferred ([ADR-008](./adr/008-opentelemetry-deferred.md)) |
| PR-3.2 | cloud-node metrics | **Done** | `GET /metrics` Prometheus text, `cloud-node/lib/metrics.js` |
| PR-3.3 | Local SQLite at-rest policy | **Done** | [ADR-007](./adr/007-local-sqlite-at-rest.md) |
| PR-3.4 | Incident response runbook | **Done** | [`runbooks/incident-response.md`](./runbooks/incident-response.md) |
| PR-3.5 | Align nightly CI | **Done** | electron + cloud-node jobs in `nightly.yml` |
| PR-3.6 | Activity title PII | **Done** | `_sanitize_activity_title()` in `activity_store.py` + test |
| PR-3.7 | Sentry alert rules | **Done** | [`runbooks/sentry-alerts.md`](./runbooks/sentry-alerts.md) |

---

## Phase 4 — Hardening & hygiene

| ID | Task | Status |
|----|------|--------|
| PR-4.1 | Telemetry SQLite retention | **Done** — `telemetry/retention.py`, daily `telemetry_prune` job |
| PR-4.2 | Cloud crash report retention | **Done** — `cloud-node/lib/crashRetention.js`, `scripts/prune-crash-reports.js` |
| PR-4.3 | Renderer diagnostics log cap | **Done** — trim at 512 KiB in `electron/rendererDiagnostics.js` |
| PR-4.4 | Integration OAuth safeStorage audit | **Done** — fail-closed saves; IPC surfaces `encryption_unavailable` |
| PR-4.5 | Fix weak voice WS assertions | **Done** — `WebSocketDisconnect` code 4401 |
| PR-4.6 | Main-process crash guards test | **Done** — `mainProcessDiagnostics.test.js` |
| PR-4.7 | OpenTelemetry backend export | **Deferred** — [ADR-008](./adr/008-opentelemetry-deferred.md) |
| PR-4.8 | STRUCTURAL_AUDIT §5 refresh | **Done** — test inventory updated 2026-06-16 |
| PR-4.9 | Playwright job/chat E2E | **Done** | `sortHappyPath.spec.ts` (job); `assistantChat.spec.ts` (chat composer smoke) |
| PR-4.10 | IPC manifest CI enforcement | **Done** | `validate-electron-ipc-manifest.cjs` in `test:electron` |
| PR-4.11 | Observability runbook | **Done** | [`runbooks/observability.md`](./runbooks/observability.md) |
| PR-4.12 | SECURITY.md sync integrity note | **Done** | GO SYNC `content_hash` section |

---

## Definition of done (program exit)

| # | Criterion | Status |
|---|-----------|--------|
| 1 | All P0 tasks Done | ✅ Phase 1 |
| 2 | GDPR export + delete + local wipe + retention | ✅ |
| 3 | Sync relay + integration + syncWorker + component + E2E tests | ✅ |
| 4 | `/ready` + crash trace + incident owner | ✅ |
| 5 | Published legal docs | ✅ Supplement ready; merge to exosites-agency EN/FR |
| 6 | STRUCTURAL_AUDIT §5 refreshed | ✅ |
| 7 | Release gate (`npm run quality`) | ✅ Passed 2026-06-18 (assistant restructure + e2e sync fix) |

---

## Verification

```bash
npm run quality                    # PASSED 2026-06-18 (post assistant restructure)
npm run verify:legal-urls          # PASSED — exosites.ch/eng/app-privacy + app-terms HTTP 200
npm run verify:production          # IPC + legal URLs + cloud auth (before tag)
```

Playwright: 12/12 e2e passed (2026-06-18).

---

## Changelog

| Date | Change |
|------|--------|
| 2026-06-16 | Initial register — 40 tasks |
| 2026-06-16 | Quality green; e2e settings search helper |
| 2026-06-16 | **Program close (engineering):** legal source = exosites-agency; URLs live; counsel-only remainder documented |
| 2026-06-18 | Quality gate re-verified after assistant restructure; e2e conversation sync loop fixed |
