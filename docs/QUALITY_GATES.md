# Quality gates (local / CI)

Run from **repository root** unless noted. Fix failures or document a tracked exception (owner + link) in [DEAD_CODE_TRIAGE.md](DEAD_CODE_TRIAGE.md) when tooling must stay red temporarily.

**Production readiness backlog:** Phased tasks for tests, observability, and PII — [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md).

## Dependency updates (no Dependabot version PRs)

This repo **does not** use Dependabot version-update PRs — they failed repeatedly on the Electron + PyInstaller monorepo and burned Actions minutes without mergeable results.

| What | Where |
|------|--------|
| CVE alerts | GitHub → **Security** → Dependabot alerts (enable in repo settings) |
| High/critical audit in CI | `npm audit` in Build Installers (informational) |
| Manual bumps before release | `npm outdated` / `pip list --outdated` in each package root |

Review security alerts when they appear; run full `npm run quality` before merging dependency bumps.

## Before a release (required)

| Step | Command |
|------|---------|
| Full local gate (lint, unused, build, unit + e2e smoke, Python tests) | `npm run quality` (see `package.json` in the repo root) |

If `npm run quality` is too slow for a small fix, at minimum run the **PR / pre-merge** table below for anything that touches the same area (e.g. frontend + backend tests for pipeline changes). CI may still run a subset; do not release without a green full gate for major or user-facing cutovers.

**Last release gate check:** run `npm run quality` and note the result in the PR or release thread.

## PR / pre-merge (recommended)

| Step | Command |
|------|---------|
| Frontend lint | `cd frontend && npm run lint` |
| Frontend typecheck + build | `cd frontend && npm run build` |
| Frontend unit tests | `cd frontend && npm test` |
| Locale key parity (if i18n touched) | `cd frontend && npm run check-locale-keys` |
| Backend tests | `cd backend && python -m pytest -q` |
| Electron IPC + unit tests | `npm run test:electron` |
| Mobile analyze + unit tests (if `mobile/` touched) | `npm run mobile:quality` |
| KPI guardrails (fixture) | `cd backend && python -m classify_eval.kpi_guardrails --sort-plan classify_eval/fixtures/baseline_sort_plan.csv --max-uncertain-rate 0.60 --max-error-rate 0.10 --max-p90-ms 5000` |

## Pre-release / weekly strict hygiene

| Step | Command |
|------|---------|
| Strict unused (frontend + backend) | `npm run check:unused:strict` |
| Baseline KPI snapshot (real run export) | `cd backend && python -m classify_eval.baseline_kpis --sort-plan "C:/path/sort-plan-*.csv" --json-out kpi-baseline.json` |

## Full release gate (root `package.json` script `quality`)

Includes lint, strict unused, frontend build, Vitest, Electron tests, backend pytest, and Playwright e2e — use before major releases; CI may run a subset.

## Performance budgets

Check these manually before a release; treat a breach as a release blocker unless a tracked exception explains it.

| Budget | Limit | How to measure |
|--------|-------|----------------|
| Renderer main chunk (minified, pre-gzip) | ≤ 2.0 MB (current ≈ 1.6 MB — investigate any growth > 10% per release) | `cd frontend && npm run build`, read the chunk sizes Vite prints |
| Time to interactive shell (fresh profile, packaged app) | ≤ 5 s on a mid-range machine (NVMe + 8 GB RAM) | Launch packaged build, stopwatch from process start to sidebar visible |
| Backend `/health` first OK (packaged, cold start) | ≤ 10 s | Electron logs the backend-ready timestamp; compare with process start |

**Last updated:** 2026-06-10
