# Testing phase checklist — desktop cloud sort

**Purpose:** Executable gate checklist before giving **packaged builds** to testers.  
**North star:** Signed-in user sorts files on **Exo cloud LLM** (VPS) — no API keys, no Remote LLM settings.

**Related:** [`SORT_GA_GATES.md`](SORT_GA_GATES.md), [`CLOSED_BETA.md`](CLOSED_BETA.md), [`GA_EXECUTION_LOG.md`](GA_EXECUTION_LOG.md)

---

## How to use this doc

1. Run phases **in order**. Do not skip Phase 2 (staging) or Phase 4 (packaged install).
2. Mark each line: `[x]` pass, `[ ]` fail, `[-]` skipped (note why).
3. **Block release** if any **BLOCKER** item fails.
4. Copy the sign-off block at the bottom when closing a release.

**Roles (fill names):**

| Role | Name | Date |
|------|------|------|
| Engineering lead | | |
| QA / tester | | |
| Ops (VPS) | | |

---

## Phase A — Code ready (every merge to `master`)

**Goal:** Same gates CI runs on PR — catch compile, lint, and unit regressions early.

| ID | BLOCKER | Check | Command | Pass criteria |
|----|---------|-------|---------|---------------|
| A1 | yes | IPC manifest | `node scripts/validate-electron-ipc-manifest.cjs` | exit 0 |
| A2 | yes | Preload ↔ `electron.d.ts` | `node scripts/validate-electron-dts.cjs` | exit 0 |
| A3 | yes | Secret logging audit | `node scripts/audit-secret-logging.cjs` | exit 0 |
| A4 | yes | Frontend lint | `cd frontend && npm run lint` | exit 0 |
| A5 | yes | Locale key parity | `cd frontend && npm run check-locale-keys` | exit 0 |
| A6 | yes | Strict unused (knip + vulture) | `npm run check:unused:strict` | exit 0 |
| A7 | yes | Frontend build | `npm run build:frontend` | exit 0 |
| A8 | yes | Frontend unit tests | `cd frontend && npm test` | exit 0 |
| A9 | yes | Frontend E2E (mocked backend) | `cd frontend && npm run test:e2e` | exit 0 — **does not prove cloud sort** |
| A10 | yes | Backend pytest (full) | `npm run test:backend` | exit 0 |
| A11 | yes | Electron unit tests | `npm run test:electron` | exit 0 |
| A12 | yes | cloud-node tests | `cd cloud-node && npm test` | exit 0 |
| A13 | no | Copy audit (cloud UX) | `npm run verify:ga-copy` | exit 0 |

**Note:** CI also runs classify eval on fixtures (`OLLAMA_EVAL=0`) and KPI guardrails on CSV — included in `quality-backend` job.

---

## Phase B — Staging infrastructure (ops + eng)

**Goal:** VPS + broker + API can mint **per-user virtual keys** (not master key delegation).

| ID | BLOCKER | Check | Command | Pass criteria |
|----|---------|-------|---------|---------------|
| B1 | yes | LiteLLM liveness | `curl -fsS https://llm-staging.exosites.ch/health/liveliness` | HTTP 200 |
| B2 | yes | Production alias (if using prod URL) | `curl -fsS https://llm.exosites.ch/health/liveliness` | HTTP 200 |
| B3 | yes | Full GA readiness script | `npm run verify:sort-ga` | all checks green |
| B4 | yes | Virtual keys (not delegation) | `npm run verify:sort-ga` | `sort_credentials_mode=virtual`, token ≠ master prefix |
| B5 | yes | Cloud API auth smoke | `npm run verify:cloud-auth` | exit 0 |
| B6 | yes | Legal URLs (store) | `npm run verify:legal-urls` | exit 0 |
| B7 | no | Queue health (if enabled) | `curl -fsS https://llm-staging.exosites.ch/v1/sort/queue/health` | HTTP 200 when queue live |
| B8 | no | Beta health bundle | `npm run ga:beta-health` | report in `reports/beta-health/` |

**If B3 fails:** fix VPS first (Postgres, LiteLLM, broker) — see [`SAAS_SORT_UX_PLAN.md`](SAAS_SORT_UX_PLAN.md) § Pre-launch A.

**Security BLOCKER (if master key was in dev `.env`, chat, or logs):**

| ID | BLOCKER | Check | Command | Pass criteria |
|----|---------|-------|---------|---------------|
| B9 | yes | Rotate LiteLLM master | `npm run ga:rotate-llm-master` | new key on VPS + Infomaniak `LITELLM_MASTER_KEY` |
| B10 | yes | Re-run readiness after rotate | `npm run verify:sort-ga` | green |

---

## Phase C — Live sort on staging (eng)

**Goal:** Real `/analyze` pipeline against staging LiteLLM — **not** mocked E2E.

| ID | BLOCKER | Check | Command | Pass criteria |
|----|---------|-------|---------|---------------|
| C1 | yes | Staging classify smoke | `npm run ga:staging-classify` | mistral classify OK |
| C2 | yes | Live sort fixtures | `npm run ga:live-sort` | ≥ **8/13** files OK (target **13/13**) |
| C3 | no | Staging fixture gate | `npm run ga:staging-fixture-gate` | within ±2% baseline |
| C4 | no | Closed-beta API bundle | `npm run ga:closed-beta-smoke` | automated section green |

**Rate limit on register:** provision verify account once:

```bash
cp cloud-node/.env.verify.example cloud-node/.env.verify
# set GA_VERIFY_PASSWORD
npm run ga:provision-verify
```

---

## Phase D — Developer machine hygiene (eng)

**Goal:** Local dev must not break cloud credentials (recent production incident class).

| ID | BLOCKER | Check | Action | Pass criteria |
|----|---------|-------|--------|---------------|
| D1 | yes | No `OLLAMA_API_KEY` in `backend/.env` | Remove line; keep `OLLAMA_MODE=remote`, `OLLAMA_HOST=https://llm-staging.exosites.ch` | `grep OLLAMA_API_KEY backend/.env` → only comment, no value |
| D2 | yes | Never put `LITELLM_MASTER_KEY` on desktop | Confirm `backend/.env` has no `sk-exo-…` master key | manual inspect |
| D3 | yes | `dotenv_bootstrap` fix present | `pytest backend/tests/test_dotenv_bootstrap.py::test_load_dotenv_early_skips_ollama_api_key_when_sort_credentials_managed` | pass |
| D4 | yes | Error sanitization present | `pytest backend/tests/test_user_facing_errors.py` | pass |
| D5 | no | Dev stack runs | `npm run dev` | app opens, `/health` 200 |

**Signed-in dev smoke (backend must be running):**

| ID | BLOCKER | Check | Command | Pass criteria |
|----|---------|-------|---------|---------------|
| D6 | yes | Desktop smoke | `npm run ga:desktop-smoke` | managed=1, remote host `https://`, `/ready` ollama ok |
| D7 | yes | Sort 5 local files in UI | manual | 0 auth failures; folders suggested |

---

## Phase E — CI build + packaged artifact (eng)

**Goal:** What testers install matches what GitHub built — not `npm run dev`.

| ID | BLOCKER | Check | Action | Pass criteria |
|----|---------|-------|--------|---------------|
| E1 | yes | Trigger installer build | GitHub → Actions → **Build Installers** → Run workflow (or push `v*` tag) | `build-macos` / `build-windows` green |
| E2 | yes | Download artifact | Actions → EXO-macOS / EXO-Windows | `.dmg` or `Exo Setup.exe` present |
| E3 | yes (mac) | Packaged app verify | `node scripts/verify-packaged-app.cjs` on built `.app` | preload, integration-config, backend slices OK |
| E4 | yes (mac) | Backend slices in DMG | `bash scripts/verify-mac-backend-slices-from-dmg.sh dist-installer/Exo.dmg` | x64 + arm64 OK |
| E5 | no | Report app weight | `npm run report:app-weight` | recorded for release notes |

**On tag releases only:** `verify-cloud-auth` + legal URLs run in CI; confirm green on the tag workflow.

---

## Phase F — Packaged install smoke (QA + eng)

**Goal:** Fresh install, sign-in, sort — the **tester happy path**.

Install from **artifact**, not dev. Use a clean user account or wipe:

```bash
# macOS — optional clean slate
rm -rf ~/Library/Application\ Support/EXO
```

| ID | BLOCKER | Check | Steps | Pass criteria |
|----|---------|-------|-------|---------------|
| F1 | yes | First launch | Open installed Exo | welcome / sign-in; no crash |
| F2 | yes | Sign in | Exo cloud account (entitled) | sidebar shows account email |
| F3 | yes | About & help | Settings → About & help → **File sorting** | “Using Exo cloud sorting” — **not** error/warn |
| F4 | yes | No dev-only UI | Settings search “Remote LLM” / sort server (developer) | **not visible** in packaged build |
| F5 | yes | Sort 10 mixed files | PDF, JPG/scan, multi-page if possible | ≥ **90%** reach review/done; **0** “auth failed” |
| F6 | yes | Error text safe | If a file fails, error message | **no** `sk-`, `Bearer`, or API key fragments |
| F7 | no | Vision / OCR | Image without thin OCR | classified or Uncertain with reason — not LLM 401 |
| F8 | no | Sign out / sign in | Account → sign out → sign in → sort again | still works (credential refresh) |
| F9 | no | Offline strip | Kill network mid-sort | honest message; recovers after network back |

**If F3 or F5 fail:** yellow banner on Sort tab → sign out/in; check `sort_credentials_meta.json` sync error; re-run Phase B.

---

## Phase G — Tester cohort (product + eng)

**Goal:** Small closed beta before wider push.

| ID | BLOCKER | Check | Action | Pass criteria |
|----|---------|-------|--------|---------------|
| G1 | yes | Cohort size | Invite ≤ 20 accounts | list in release notes |
| G2 | yes | Invite copy | [`CLOSED_BETA.md`](CLOSED_BETA.md) template | no “configure API key” |
| G3 | yes | Build version recorded | `package.json` version + git SHA in support channel | testers know build ID |
| G4 | no | Daily health (7 days) | `npm run ga:beta-health` | no red broker/LLM |
| G5 | no | Support watch | VPS logs + crash ingest | no P0 “sort completely broken” |

**Manual corpus (once per release):**

| File type | Count | Result |
|-----------|-------|--------|
| PDF invoice | 3 | |
| Scanned image / photo | 3 | |
| Mixed language | 2 | |
| Large PDF (10+ pages) | 1 | |
| Video (if enabled) | 1 | |

---

## Phase H — CI gaps to close (engineering backlog)

Track these so “green CI” ≈ “sort works”. Not required for a single tester build, but **required before marketing GA**.

| ID | Item | Owner | Done |
|----|------|-------|------|
| H1 | Add workflow job: `npm run verify:sort-ga` on `master` (daily + manual) | Eng | [x] `.github/workflows/sort-staging-gate.yml` |
| H2 | Scheduled `ga:live-sort` (long-running runner) | Eng | [ ] |
| H3 | Integration test: Electron spawn env + `load_dotenv_early` + `_api_key()` | Eng | [x] `test_managed_sort_spawn_env.py` |
| H4 | Unit test: `syncSortCredentialsFromCloud` happy path | Eng | [ ] |
| H5 | Contract test: job `error` field never contains secrets | Eng | [x] `test_job_error_sanitization_contract.py` |
| H6 | `verify-packaged-app` on Windows build job | Eng | [ ] |
| H7 | CI fail if tracked files contain `OLLAMA_API_KEY=sk-` | Eng | [x] `scripts/audit-env-secrets-in-repo.sh` + CI |
| H8 | Account UI: “Refresh sort connection” → `syncSortCredentials` IPC | Eng | [x] Settings → About & help |

---

## Quick reference — one command block (pre-tag)

```bash
# From repo root — expect ~20–40 min including ga:live-sort
npm run check:unused:strict
npm run test:backend
npm run test:electron
cd frontend && npm test && npm run test:e2e && cd ..
npm run verify:sort-ga
npm run verify:cloud-auth
npm run ga:staging-classify
npm run ga:live-sort
npm run ga:closed-beta-smoke
```

Then: **workflow_dispatch** Build Installers → Phase F on downloaded artifact.

---

## Sign-off — tester build release

```
Release version: _______________
Git commit:      _______________
Artifact:        macOS dmg / Windows exe — URL or Actions run #___

Phase A (code):     [ ] PASS   [ ] FAIL
Phase B (staging):  [ ] PASS   [ ] FAIL
Phase C (live sort):[ ] PASS   [ ] FAIL   (score: ___/13)
Phase D (dev hygiene):[ ] PASS   [ ] FAIL
Phase E (CI build): [ ] PASS   [ ] FAIL
Phase F (packaged): [ ] PASS   [ ] FAIL   (files sorted: ___/10)

Known issues shipped: _______________
Rollback: previous dmg / exe at _______________

Engineering lead: _______________  Date: _______
QA:               _______________  Date: _______
```

---

## What CI does **not** prove (read before trusting green checks)

| Green in GitHub | Does **not** mean |
|-----------------|-------------------|
| Playwright `sortHappyPath` | Cloud LiteLLM auth works |
| `quality-backend` pytest | Live classify on VPS |
| `build-macos` success | Signed-in packaged sort works |
| `verify:cloud-auth` on PR | Ran (often `continue-on-error`) |
| Branch push build | Installable artifact uploaded (tags/dispatch only) |

**Tester-ready = Phase B + C + F pass on the exact artifact you ship.**
