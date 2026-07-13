# Structural audit — EXO (Option A)

**Date:** 2026-04-03 (inventory); **architecture refresh:** 2026-04-11; **last reviewed:** 2026-06-16 (production-readiness pass)  
**Hot-spot refresh:** Run `node scripts/audit-hotspots.cjs` (see P0-0.3.1). Post–assistant-restructure (2026-06-18): `AppShell.tsx` **~329 lines** (split into `frontend/src/apps/`); `useWorkspaceBatch.ts` (~789), `AppMainWorkspace.tsx` (~682). Backend tool catalog in `tool_registry/declarations/` + `assemble.py`; `/agent/task` uses `orchestrator.orchestrate` via `agent/orchestrator_runner.py`.
**Scope:** Read-only inventory, coupling notes, hot spots, test coverage signals, and a **phased refactor backlog**. For an up-to-date **request flow, ports, and `.env` resolution**, use [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) as the source of truth for runtime behavior; *this* document is an inventory + debt list that drifts until updated.

**When to update this file:** After meaningful changes to **Electron IPC** surface, **job pipeline** boundaries, **routers** under `backend/routes/`, or when **refactoring** a file called out in §1 as a hot spot (refresh line counts and notes).

---

## 1. Executive summary

The repo is a **desktop-first monorepo**: **Electron** hosts a **Vite/React** renderer and spawns a **local FastAPI** (`backend/main.py`) via [`electron/backendProcess.js`](electron/backendProcess.js). Optional **account API** lives in [`cloud-node/`](../cloud-node/) (not required for local desktop use).

**Complexity concentrates in:**

- [`frontend/src/components/QueuePanel.tsx`](frontend/src/components/QueuePanel.tsx) (~130 lines) — composition shell: [`useQueuePanelController`](frontend/src/components/queue/useQueuePanelController.tsx), desktop/web source sections, [`QueuePanelJobSection`](frontend/src/components/queue/QueuePanelJobSection.tsx). Workspace **Run sort** in [`useWorkspaceBatch`](frontend/src/components/queue/useWorkspaceBatch.ts); job card in [`QueueActiveJobCard`](frontend/src/components/queue/QueueActiveJobCard.tsx).
- [`frontend/src/AppShell.tsx`](frontend/src/AppShell.tsx) (~329 lines) — composition shell; chrome in [`apps/shared/useAppShellChrome.ts`](frontend/src/apps/shared/useAppShellChrome.ts), workspace in [`apps/workspace/useWorkspaceController.ts`](frontend/src/apps/workspace/useWorkspaceController.ts). [`App.tsx`](frontend/src/App.tsx) (~21 lines) is bootstrap only.
- [`backend/main.py`](backend/main.py) (~100 lines) — composition only: dotenv, `FastAPI`, `app.state`, router includes (job routes split across [`routes/job_routes_*.py`](../backend/routes/)).
- [`backend/classifier.py`](backend/classifier.py), [`backend/ingestor.py`](backend/ingestor.py) — core ML/OCR pipeline (see also `classifier_*` / `ingest_*` helper modules if present).

**IPC contract** between [`electron/preload.js`](electron/preload.js) and [`electron/ipcHandlers.js`](electron/ipcHandlers.js) is **aligned** with [`frontend/src/types/electron.d.ts`](frontend/src/types/electron.d.ts) for the main app bridge (`window.electronAPI`). A **second** bridge (`window.electronSetup` in [`electron/preload-setup.js`](electron/preload-setup.js)) serves the setup wizard only.

---

## 2. Phase 1 — Inventory (entry points, stores, boundaries)

### 2.1 Electron

| Item | Location / notes |
|------|-------------------|
| Main entry | [`electron/main.js`](electron/main.js) — lifecycle, `registerHandlers()`, setup vs main flow via [`electron/windows.js`](electron/windows.js). |
| IPC | [`electron/ipcHandlers.js`](electron/ipcHandlers.js) — all `ipcMain.handle` registrations (see §3.1). |
| Preload (main app) | [`electron/preload.js`](electron/preload.js) — exposes `window.electronAPI`. |
| Preload (setup) | [`electron/preload-setup.js`](electron/preload-setup.js) — `window.electronSetup` (`setup:launchApp`, `setup:confirmOcr`, …). |
| Backend child | [`electron/backendProcess.js`](electron/backendProcess.js) — spawns `uvicorn main:app`, `SKIP_BACKEND`, `EXOSITES_USER_DATA` for Python. |
| Telemetry offline | [`electron/telemetryQueue.js`](electron/telemetryQueue.js) — `userData/telemetry-offline-queue.json`. |
| Env / flags | `NODE_ENV`, `SKIP_BACKEND`, `ELECTRON_OVERRIDE_DIST_PATH`; backend port in [`electron/constants.js`](electron/constants.js) (`BACKEND_PORT`). |

### 2.2 Frontend (renderer)

| Item | Location / notes |
|------|-------------------|
| Bootstrap | [`frontend/src/main.tsx`](frontend/src/main.tsx) — `ErrorBoundary`, dev scenario, `App`. |
| Root UI | [`frontend/src/App.tsx`](frontend/src/App.tsx) — tabs, job flow, settings, welcome, cloud gate. |
| HTTP API | [`frontend/src/api/`](frontend/src/api/) — [`client.ts`](frontend/src/api/client.ts), [`jobs.ts`](frontend/src/api/jobs.ts), [`index.ts`](frontend/src/api/index.ts); `API_BASE` = trimmed `VITE_API_BASE` or `DEFAULT_API_BASE` from [`constants.ts`](../frontend/src/constants.ts) (same port as `electron/constants.js` `BACKEND_PORT`). |
| Persistent settings | [`frontend/src/hooks/useAppSettings.ts`](frontend/src/hooks/useAppSettings.ts) — localStorage-backed `AppSettings`. |
| AI allowlisted actions | [`docs/AI_ACTIONS_ARCHITECTURE.md`](AI_ACTIONS_ARCHITECTURE.md) — executor model; [`frontend/src/systemCommands/`](frontend/src/systemCommands/) — catalog, parse, app capability map. |
| Build-time env | `VITE_API_BASE`, `VITE_PRIVACY_POLICY_URL`, `VITE_SENTRY_DSN`, `VITE_DEV_SCENARIO` (dev), `import.meta.env.DEV/MODE`. |

### 2.3 Backend (local API)

| Item | Location / notes |
|------|-------------------|
| ASGI app | [`backend/main.py`](backend/main.py) — FastAPI app, CORS `*`, `app.state` (`jobs`, `JobService`, `HistoryLog`, `ContextIndex`); HTTP routes live under [`backend/routes/`](backend/routes/). |
| Packaged entry | [`backend/server.py`](backend/server.py) — `uvicorn.run("main:app", …)` with `--port`/`--host`. |
| Job orchestration | [`backend/job_service.py`](backend/job_service.py) — `JobService` class; receives callables + `jobs` dict from `main`. |
| Persistence | [`backend/job_store.py`](backend/job_store.py) — load/save job records; path tied to app state. |
| Telemetry | [`backend/telemetry/routes.py`](backend/telemetry/routes.py) — prefix `/v1/telemetry`; DB path `TELEMETRY_SQLITE_PATH` or default under `backend/telemetry/data/`. |
| Constants / env | [`backend/constants.py`](backend/constants.py) — `BACKEND_PORT`, `APP_STATE_DIR`, `OCR_MAX_JOIN_LANGS`, `SEMANTIC_RERANK_MODEL`, etc. |

**HTTP surface (representative):** `GET /health` and related endpoints on [`meta_routes`](backend/routes/meta_routes.py), [`ollama_routes`](backend/routes/ollama_routes.py); jobs on [`job_routes`](backend/routes/job_routes.py) (`POST /analyze`, `/sort`, `/apply`, job lifecycle, `/folder-tree`); Gmail on [`gmail_routes`](backend/routes/gmail_routes.py). **Telemetry:** [`backend/telemetry/routes.py`](backend/telemetry/routes.py) (nested under `/v1/telemetry`).

### 2.4 Cloud (account API)

| Item | Location / notes |
|------|-------------------|
| Account API | [`cloud-node/`](../cloud-node/) — auth, `/v1/me`, crash ingest, social sign-in. Deploy via [`scripts/deploy-cloud-api.sh`](../scripts/deploy-cloud-api.sh). |

### 2.5 Scripts (packaging)

[`scripts/`](scripts/) — `run-electron-dev.js`, `package-app.js`, `package-mac.js`, `render-icon.cjs`, `prepare-mac-dev-app.cjs` — build/publish only; no runtime architecture impact.

---

## 3. Phase 2 — Coupling and boundaries

### 3.1 Electron IPC parity (main app)

All channels exposed on `window.electronAPI` in [`electron/preload.js`](electron/preload.js) have matching `ipcMain.handle` entries. **CI enforces parity:** `node scripts/validate-electron-ipc-manifest.cjs` (100 channels) and `node scripts/validate-electron-dts.cjs` (107 preload keys). See [ARCHITECTURE.md](ARCHITECTURE.md) and [REMEDIATION_PLAN.md](REMEDIATION_PLAN.md) P0-0.1.*.

[`frontend/src/types/electron.d.ts`](frontend/src/types/electron.d.ts) is validated in CI against the IPC manifest. **Setup wizard:** IPC `setup:*` is **not** part of `ElectronAPI`; it lives on `electronSetup` — acceptable split, documented in [ARCHITECTURE.md](ARCHITECTURE.md).

### 3.2 Frontend import direction

- Hooks (e.g. [`useEntitlement.ts`](frontend/src/hooks/useEntitlement.ts)) depend on [`api.ts`](frontend/src/api.ts), not on heavy UI components — **no “hooks → components” inversion** detected in [`frontend/src/hooks`](frontend/src/hooks).
- [`api.ts`](frontend/src/api.ts) imports types from [`types/settings.ts`](frontend/src/types/settings.ts) — **one-way**; low circular risk.

### 3.3 Backend: `main.py` vs services

- [`job_service.py`](backend/job_service.py) encapsulates analyze/apply orchestration; **`main.py`** wires `app.state` and includes routers. Route bodies for jobs live in [`routes/job_routes_analyze.py`](backend/routes/job_routes_analyze.py), [`routes/job_routes_lifecycle.py`](backend/routes/job_routes_lifecycle.py), and shared helpers in [`routes/job_enqueue_helpers.py`](backend/routes/job_enqueue_helpers.py).
- Prefer **`create_app()`** from [`main.py`](backend/main.py) (see [ARCHITECTURE.md](ARCHITECTURE.md)) with `TestClient` for isolated tests, or `import main` when mutating `main.jobs` / patching `main.history`.

### 3.4 Cloud ↔ backend

Crash ingest and client config are served by **`cloud-node/`**; the local backend forwards crash reports when configured (`backend/scripts/test_crash_ingest_connection.py` verifies reachability).

---

## 4. Phase 3 — Duplication and hot spots (ranked)

| Rank | Area | Lines (approx.) | Issue |
|------|------|-----------------|--------|
| 1 | [`frontend/src/components/queue/useWorkspaceBatch.ts`](frontend/src/components/queue/useWorkspaceBatch.ts) | ~789 | Workspace Run sort orchestration; next split candidate if needed. |
| 2 | [`frontend/src/AppShell.tsx`](frontend/src/AppShell.tsx) | ~329 | App shell composition (`apps/shared`, `apps/workspace`, `apps/assistant`). |
| 3 | [`frontend/src/components/settings/ModelDownloadBlocks.tsx`](frontend/src/components/settings/ModelDownloadBlocks.tsx) | ~928 | Model download / install UI. |
| 4 | [`frontend/src/components/AppMainWorkspace.tsx`](frontend/src/components/AppMainWorkspace.tsx) | ~682 | Main workspace layout. |
| 5 | [`backend/gmail_import.py`](backend/gmail_import.py) | ~805 | Gmail import pipeline. |
| 6 | [`backend/classifier.py`](backend/classifier.py) | ~620 | Prompts + Ollama + scoring. |
| 7 | [`backend/job_service/_impl.py`](backend/job_service/_impl.py) | ~707 | Analyze/apply orchestration. |
| 8 | [`frontend/src/components/SettingsPanel.tsx`](frontend/src/components/SettingsPanel.tsx) | ~618 | Settings shell. |
| 9 | [`electron/integrations/google.js`](electron/integrations/google.js) | ~991 | Google OAuth, Drive list/import. |
| 10 | i18n locale bundles (`en.ts`, `de.ts`, …) | ~2.5k each | Intentional bundles; parity via `localeKeyParity.test.ts`. |

**Remediated (2026-06):** `QueuePanel.tsx` (130), `App.tsx` (21), `voice_session.py` (118), voice frontend split (`useVoiceAudio`, `useVoiceWebSocket`, frame router).

**Google Drive sort path (desktop):** Renderer → `window.electronAPI.integrationImportGoogleDriveFiles({ fileIds })` → local staging under `userData` → absolute paths in `POST /analyze` (see [ARCHITECTURE.md](ARCHITECTURE.md) and [INTEGRATIONS.md](INTEGRATIONS.md)). Same Google OAuth account as **Connect Gmail** where both use provider `google`.

**Duplication signals (lightweight):**

- **Entitlement:** [`useEntitlement`](frontend/src/hooks/useEntitlement.ts) uses IPC or `GET /entitlement/status` — mirrors backend [`entitlement_gate.py`](backend/entitlement_gate.py); keep behavior aligned when changing gates.
- **Toasts / errors:** Many components use `toast` + [`toastUserError`](frontend/src/utils/userGuidance.ts) — acceptable pattern; consolidation is polish, not blocking.

---

## 5. Phase 4 — Tests and gaps

**Inventory (2026-06-16):** See [`PRODUCTION_READINESS.md`](PRODUCTION_READINESS.md) for the execution register. Approximate counts:

| Stack | Framework | Files / tests | Notes |
|-------|-----------|---------------|-------|
| Backend | pytest | **122** `backend/tests/test_*.py` | Core pipeline, voice, memory, sync, privacy, health |
| Frontend | Vitest | **81** `frontend/src/**/*.test.ts(x)` | Utils + component tests (`ReviewTable`, `SettingsPrivacySection`, assistant chat core) |
| Electron | `node:test` | **71** (root `npm run test:electron`) | IPC manifest CI, integrations, secrets, sync, diagnostics |
| cloud-node | `node:test` | **20** | Auth rate limit, sync relay, crash ingest, metrics |
| Mobile | Flutter | **10** | Widget, sync crypto, crash reporter |
| Sync crypto | pytest | **4** under `sync/tests/` | Cross-language contract |
| Playwright | e2e | Smoke + Settings | No full job/chat path yet |

### 5.1 Frontend (Vitest)

Representative coverage:

| Area | Test files |
|------|------------|
| Review queue | [`reviewTableFilters.test.ts`](../frontend/src/components/reviewTableFilters.test.ts), [`ReviewTable.test.tsx`](../frontend/src/components/ReviewTable.test.tsx) |
| Settings / privacy | [`SettingsPrivacySection.test.tsx`](../frontend/src/components/settings/SettingsPrivacySection.test.tsx), [`settingsPersist.test.ts`](../frontend/src/settings/settingsPersist.test.ts) |
| Assistant chat | [`AssistantChatPanelCore.test.ts`](../frontend/src/features/assistant/chat/AssistantChatPanelCore.test.ts), [`commitAssistantTurn.test.ts`](../frontend/src/features/assistant/chat/commitAssistantTurn.test.ts) |
| Telemetry | [`redact.test.ts`](../frontend/src/telemetry/redact.test.ts), [`crashIngestDiagnostics.test.ts`](../frontend/src/telemetry/crashIngestDiagnostics.test.ts) |
| i18n | [`localeKeyParity.test.ts`](../frontend/src/i18n/localeKeyParity.test.ts) |

**Gap:** No full `AppShell` integration test — refactors rely on `apps/shared/bridges/workspaceAssistant.test.ts`, `useConversations.persist.test.ts`, unit tests, and E2E (12/12 incl. assistant chat smoke).

### 5.1b Electron main (Node.js `node:test`)

Run from repo root: `npm run test:electron` (IPC manifest + handler registration validated first).

| Test file | Focus |
|-----------|--------|
| [`electron/secretsStore.test.js`](../electron/secretsStore.test.js) | ADR-006 safeStorage fail-closed |
| [`electron/syncWorker.test.js`](../electron/syncWorker.test.js) | GO SYNC prefs |
| [`electron/localDataWipe.test.js`](../electron/localDataWipe.test.js) | GDPR local file wipe |
| [`electron/mainProcessDiagnostics.test.js`](../electron/mainProcessDiagnostics.test.js) | Main-process error normalization |
| [`electron/rendererDiagnostics.test.js`](../electron/rendererDiagnostics.test.js) | Diagnostics log trim |
| [`electron/integrations/*.test.js`](../electron/integrations/) | Provider catalog, Microsoft, Google Drive |

### 5.1c Playwright (`frontend/e2e`)

| Area | Notes |
|------|--------|
| Shared bootstrap | [`frontend/e2e/helpers/appReady.ts`](../frontend/e2e/helpers/appReady.ts) |
| Specs | Smoke load, Settings navigation, AI system commands toggle, integrations opt-in |

**Gap:** No E2E for sort jobs, chat streaming, or `api.ts` error paths — smoke-level only.

### 5.2 Backend (pytest)

**122** modules under [`backend/tests/`](../backend/tests/) including: jobs, classifier, ingestor, telemetry + **retention**, voice WS auth, integration tools (Google/Microsoft), **privacy wipe**, **health `/ready`**, proactive scheduler, memory signal quality.

**Gap:** Some routers still exercised via `import main` — prefer `create_app()` + TestClient for new route tests.

### 5.3 cloud-node

[`cloud-node/test/`](../cloud-node/test/) — sync relay, auth rate limit, crash routes, **Prometheus `/metrics`**.

### 5.4 Mobile

[`mobile/test/`](../mobile/test/) — adaptive shell, sync crypto contract, optional crash reporter stub.

---

## 6. Phase 5 — Phased refactor backlog (P0–P2)

### P0 — Low risk, high clarity (documentation / contracts)

| ID | Scope | Status | Notes |
|----|--------|--------|-------|
| P0-1 | IPC manifest + CI | **Done** | `validate-electron-ipc-manifest.cjs`, `validate-electron-dts.cjs` |
| P0-2 | Docs (two bridges) | **Done** | ARCHITECTURE.md IPC workflow |

### P1 — Medium risk (split large UI / API surface)

| ID | Scope | Problem | Direction | Prerequisite | Risk |
|----|--------|---------|-----------|----------------|------|
| P1-1 | [`App.tsx`](frontend/src/App.tsx) / `AppShell` | **Done** | App.tsx 21 lines; shell in `AppShell.tsx` |
| P1-2 | [`main.py`](backend/main.py) | Route + state soup | FastAPI `APIRouter` modules: `routes/jobs.py`, `routes/models.py`, …; keep shared deps injected | TestClient per router + existing pytest | Medium |
| P1-3 | [`SettingsModels.tsx`](frontend/src/components/SettingsModels.tsx) | Hard to navigate | Split by concern (install UI, model list, errors) | Visual QA in Settings | Medium |

### P2 — Higher effort (architecture)

| ID | Scope | Problem | Direction | Prerequisite | Risk |
|----|--------|---------|-----------|----------------|------|
| P2-1 | Job domain | `import main` in tests | Replace with app factory `create_app()` + dependency overrides | Refactor P1-2 or parallel | High |
| P2-2 | Ingest/classify | Large modules | Package split + explicit interfaces | Benchmarks or golden tests on classification | High |
| P2-3 | Frontend E2E | Smoke only (see §5.1c); no job/chat/API path coverage | Expand Playwright for critical flows | CI time budget | Medium–High |

---

## 7. Completion checklist (Option A “done”)

- [x] Boundary diagram and IPC/API inventory documented (§2–§3).
- [x] Top hot spots identified with file references (§4).
- [x] Backlog sequenced P0–P2 (§6); no single “refactor everything” item.
- [x] Test inventory and gaps noted (§5) — **refreshed 2026-06-16** for production-readiness pass.

**Next step:** Engineering remediation plan ([REMEDIATION_PLAN.md](REMEDIATION_PLAN.md)) is **78/78 complete** (2026-06-14). Future work: optional splits of `useWorkspaceBatch`, `AppShell`, or integration modules — not in the original plan scope.
