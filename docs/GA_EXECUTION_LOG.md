# GA execution log — 2026-06-19

## Status: ready for **closed beta** on staging

| Step | Result |
|------|--------|
| Virtual keys + VPS broker | **PASS** |
| `api.exosites.ch` virtual mode | **PASS** |
| `./scripts/verify-sort-ga-readiness.sh` | **PASS** |
| `./scripts/verify-cloud-auth-api.sh` (broker credentials) | **PASS** |
| Master key rotation | **DONE** — `npm run ga:rotate-llm-master` |
| Vision + cloud sort model list | **DONE** (code) |
| KPI guardrails (CI fixture) | **PASS** |
| Copy audit (automated) | **PASS** — `npm run verify:ga-copy` |
| Packaged `integration-config.json` | **DONE** — `EXOSITES_SORT_CREDENTIALS_URL` |
| E2E sort happy path | **PASS** |
| CI fixture eval | **PASS** — 75% automation, 100% safety on gold |
| Closed-beta smoke | **PASS** — `npm run ga:closed-beta-smoke` |
| Staging classify smoke | **PASS** — invoice fixture → `Invoices` via mistral |
| Staging full fixture eval | **PASS** — 13 cases, live mistral on VPS |
| GA verify login account | **DONE** — `ga-verify@exosites.ch` via `npm run ga:provision-verify` |
| Live cloud sort smoke (`ga:live-sort`) | **PASS** — 13/13 fixtures, direct path when queue idle (~14 min, 2026-06-20) |
| Stale credential auto-refresh | **DONE** — probe `/v1/models` before skipping sync |
| Corpus compare script | **DONE** — `npm run ga:corpus-compare` |
| Production `llm.exosites.ch` | **LIVE** — DNS A → YOUR_LLM_VPS_IPV4, TLS + broker verified |

## Architecture

[`docs/CLOUD_ARCHITECTURE.md`](CLOUD_ARCHITECTURE.md)

- **api.exosites.ch** — auth, trial, GO SYNC
- **llm-staging.exosites.ch** — inference + credential broker

## Closed beta checklist (you)

1. Restart desktop app (pick up broker URL + vision merge)
2. Sign in → sort 10+ mixed files
3. Settings → Vision → Refresh models → confirm moondream
4. Invite small cohort on staging

## Still before open marketing

| Item | Command / owner |
|------|-----------------|
| Real corpus ±2% eval | Manual QA — `classify_eval.summarize_export` |
| `llm.exosites.ch` production | Ops / DNS |
| Rollout 10% → 50% → GA | Product |
| Gemini billing for chat/voice | Separate track |
| Load test 5 concurrent sorts (queue) | **PASS** — p95 25.5s, 0% errors (`sort-capacity-queue-2026-06-20T222428Z.json`) |
| Redis fair queue on staging | **LIVE** — `SORT_LLM_QUEUE_IN_CREDENTIALS=auto` (direct when idle) |
| Queue admission policy | **DONE** — auto/always/never; see `docs/SORT_GA_GATES.md` |
| Queue admission verify | **PASS** — idle credentials omit `queue_url` (`npm run ga:verify-queue-admission`) |
| Staging fixture gate | `npm run ga:staging-fixture-gate` — ±2% vs `baseline_staging_fixture.json` |
| Beta daily health | `npm run ga:beta-health` → `reports/beta-health/` |
| Prometheus on VPS | `npm run ga:enable-prometheus-vps` (optional Phase 4) |
| Direct capacity (5 users) | **PASS** — p95 9.6s, 0% errors (2026-06-20) |
| Staging fixture eval (live mistral) | **DONE** — 13 cases; report `reports/sort-capacity/staging-fixture-eval-2026-06-20.json` |
| Capacity baseline script | `npm run ga:sort-capacity-queue` (5 users) |

## Ops commands

```bash
npm run verify:sort-ga
npm run verify:cloud-auth
npm run ga:closed-beta-smoke
npm run ga:staging-classify
npm run ga:live-sort          # 13 fixture files, full /analyze pipeline
npm run ga:desktop-smoke
npm run ga:enable-production-llm  # after DNS for llm.exosites.ch
npm run ga:rotate-llm-master    # quarterly or after leak
VPS_SSH=ubuntu@YOUR_LLM_VPS_IPV4 ./scripts/package-llm-ga-to-vps.sh --run-enable
```
