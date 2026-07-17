# Quality gates (local / CI)

Run from **repository root** unless noted. Fix failures or document a tracked exception (owner + link) in [DEAD_CODE_TRIAGE.md](DEAD_CODE_TRIAGE.md) when tooling must stay red temporarily.

**Production readiness backlog:** Phased tasks for tests, observability, and PII — [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md).

CI is tiered so expensive Mac/Windows packaging is **not** on every PR. See [`.github/workflows/build.yml`](../.github/workflows/build.yml).

## CI tiers (right job at the right time)

| Tier | When | What |
|------|------|------|
| **L0 Contract** | Every PR / tag | IPC manifest, `electron.d.ts` parity, secret audits |
| **L1 Merge** | PR path filters | Frontend lint/build/unit; backend pytest + sync + classify KPI; `test:electron`; cloud-node; sort-queue |
| **L2 Smoke** | PR if packaging paths / frontend | Playwright `e2e/smoke.spec.ts`; thin Mac `package:mac` + `verify:packaged-app` when packaging paths change |
| **L3 Release** | `v*` tag or `workflow_dispatch` | Full Win + universal Mac installers, legal URLs, cloud-auth, `verify:security-posture` |
| **L3.5 Stage** | `v*` tag | `verify:release-version` + GitHub prerelease + rsync **staging** feed only (`exo-assistant-staging`) |
| **L3.6 Promote** | Workflow dispatch `Promote desktop feed` + Environment approval | Snapshot LKG → production `exo-assistant` feed |
| **L4 Weekly** | Monday schedule | Full Playwright, `check:unused:strict`, audits, security posture; sort-staging live probes |

**Required merge check:** job `quality` (aggregate). Full installers are **not** required to merge.

### Path filters (PR)

| Filter | Paths (summary) | Jobs |
|--------|-----------------|------|
| `frontend` | `frontend/**` | `quality-frontend` (+ e2e smoke) |
| `backend` | `backend/**`, `sync/**` | `quality-backend` |
| `electron` | `electron/**`, root `package.json` | `quality-electron` |
| `cloud` | `cloud-node/**` | `quality-cloud` |
| `packaging` | electron + package scripts + `verify-packaged-*` + `build.yml` | `package-smoke-mac` (+ electron tests) |
| `sort_queue` | `infra/llm/sort-queue/**` | `quality-sort-queue` |

## Dependency updates (no Dependabot version PRs)

This repo **does not** use Dependabot version-update PRs — they failed repeatedly on the Electron + PyInstaller monorepo and burned Actions minutes without mergeable results.

| What | Where |
|------|--------|
| CVE alerts | GitHub → **Security** → Dependabot alerts (enable in repo settings) |
| High/critical audit in CI | Weekly deep workflow (informational) |
| Manual bumps before release | `npm outdated` / `pip list --outdated` in each package root |

Review security alerts when they appear; run full `npm run quality` before merging dependency bumps.

## Before a release (required)

| Step | Command |
|------|---------|
| Path-aware push gate | `npm run verify:local` (also runs via Husky pre-push) |
| Desktop pre-tag gate | `npm run release:desktop` — quality + **unsigned** `build:mac` + packaged-app + backend health; writes `.git/exo-release-gate` |
| Mobile pre-tag gate | `npm run release:mobile` |
| Version alignment | `npm run verify:release-version` (tag must match package / appVersion / Inno / CHANGELOG) |
| Tag CI | Push `v*` — L3 builds + L3.5 stages to staging feed (not prod) |

Full flow: [runbooks/pre-push-verification.md](runbooks/pre-push-verification.md).

PRs do **not** build Windows/Mac installers. Packaging confidence on PRs comes from path-gated `package-smoke-mac` + Linux electron/packaging unit tests.

## PR / pre-merge (local mirror of L1)

| Step | Command |
|------|---------|
| Frontend lint | `cd frontend && npm run lint` |
| Frontend build | `cd frontend && npm run build` |
| Frontend unit tests | `cd frontend && npm test` |
| Frontend e2e smoke | `cd frontend && npm run test:e2e:smoke` |
| Locale key parity (if i18n touched) | `cd frontend && npm run check-locale-keys` |
| Backend tests | `cd backend && python -m pytest -q` |
| Electron IPC + unit tests | `npm run test:electron` |
| Sort-queue (if touched) | `cd infra/llm/sort-queue && npm test` |
| Mobile (if `mobile/` touched) | `npm run mobile:quality` |
| KPI guardrails (fixture) | `cd backend && python -m classify_eval.kpi_guardrails --sort-plan classify_eval/fixtures/baseline_sort_plan.csv --max-uncertain-rate 0.60 --max-error-rate 0.10 --max-p90-ms 5000` |
| Packaging change | `npm run package:mac` then `npm run verify:packaged-app` |

## Weekly / scheduled (L4)

| Step | Where |
|------|--------|
| Full Playwright e2e | `Weekly deep quality` workflow |
| `check:unused:strict` | Weekly deep |
| `verify:security-posture` | Weekly deep + `v*` tag |
| Sort staging live (`verify:sort-ga`, classify/vision) | `Sort staging gate` (Monday) |

## Manual / secrets (not PR merge blockers)

| Script | Purpose |
|--------|---------|
| `npm run verify:cloud-auth` | Live api.exosites.ch (tag CI strict) |
| `npm run verify:go-sync` | GO SYNC relay |
| `npm run verify:datasuite*` / `verify:product-analytics` | Infra smoke |
| `npm run ga:*` (desktop-smoke, live-sort, closed-beta, …) | Staging / beta ops |
| `OLLAMA_EVAL=1` classify eval | Local GPU/model |

## Full release gate (root `package.json` script `quality`)

Includes lint, strict unused, frontend build, Vitest, Electron tests, backend pytest, and Playwright e2e — use before major releases; CI may run a path-filtered subset on PRs.

## Performance budgets

Check these manually before a release; treat a breach as a release blocker unless a tracked exception explains it.

| Budget | Limit | How to measure |
|--------|-------|----------------|
| Renderer main chunk (minified, pre-gzip) | ≤ 2.0 MB (current ≈ 1.6 MB — investigate any growth > 10% per release) | `cd frontend && npm run build`, read the chunk sizes Vite prints |
| Time to interactive shell (fresh profile, packaged app) | ≤ 5 s on a mid-range machine (NVMe + 8 GB RAM) | Launch packaged build, stopwatch from process start to sidebar visible |
| Backend `/health` first OK (packaged, cold start) | ≤ 10 s | Electron logs the backend-ready timestamp; compare with process start |

**Last updated:** 2026-07-16
