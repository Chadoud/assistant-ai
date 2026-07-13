# Sort GA gates (closed beta → production)

Explicit pass/fail criteria before calling cloud sort **GA-ready**. Run checks in order; a later gate does not override an earlier failure.

## Phase 0 — Infrastructure

| Gate | Pass | Command / probe |
|------|------|-----------------|
| Staging LiteLLM live | HTTP 200 on `/health/liveliness` | `curl https://llm-staging.exosites.ch/health/liveliness` |
| Virtual keys | `/key/generate` returns per-user key | `./scripts/verify-sort-ga-readiness.sh --require-virtual-keys` |
| Broker credentials | `POST /v1/sort/credentials` → token + slots | same script |
| Queue service (optional) | `/v1/sort/queue/health` → 200 when enabled | VPS or readiness script |
| Production alias | `https://llm.exosites.ch/health/liveliness` → 200 | pre-GA optional; required for prod cutover |

## Phase 1 — Capacity (5 concurrent cloud sorters)

Target: **5 users** sorting at once without >15% errors or p95 >120s.

| Mode | When | Pass criteria |
|------|------|---------------|
| Direct LiteLLM | Baseline, low load | `npm run ga:sort-capacity` — 5 users, error rate ≤15%, p95 ≤120s |
| Redis queue | Multi-tenant fairness | `npm run ga:sort-capacity-queue` — same thresholds |

Load tests use `USE_SORT_QUEUE=1` and hit `/v1/sort/inference` directly; they do **not** depend on `queue_url` in desktop credentials.

## Phase 1b — Queue admission (desktop UX)

| Gate | Pass |
|------|------|
| Idle single-user | Credentials **omit** `queue_url` when queue is idle (`SORT_LLM_QUEUE_IN_CREDENTIALS=auto`) |
| Under load | Credentials **include** `queue_url` when `pending_jobs ≥ SORT_QUEUE_ADMIT_THRESHOLD` or `overloaded` |
| Live file sort | `ga-live-sort-smoke.py` — ≥8/13 fixtures reach review within 600s per file (direct path when idle) |

Env knobs (VPS broker + cloud-node):

```bash
SORT_LLM_QUEUE_ENABLED=1          # queue workers run on VPS
SORT_LLM_QUEUE_IN_CREDENTIALS=auto # default: direct when idle, queue when busy
SORT_QUEUE_ADMIT_THRESHOLD=2      # pending jobs before routing desktops to queue
```

Force queue for ops/stress: `SORT_LLM_QUEUE_IN_CREDENTIALS=always`.

Verify: `npm run ga:verify-queue-admission` — queue live + credentials omit `queue_url` when idle.

## Phase 2 — End-to-end file sort

| Gate | Pass |
|------|------|
| Fixture corpus | `python scripts/ga-live-sort-smoke.py` — ≥ `GA_LIVE_SORT_MIN_OK` (default 8) files classified |
| Managed credentials | Desktop `backend-env-overrides.json` has `EXOSITES_SORT_CREDENTIALS_MANAGED=1`, `OLLAMA_MODE=remote` |
| No master delegation | Credential token ≠ `LITELLM_MASTER_KEY` |

Workflow:

```powershell
$env:GA_LIVE_SORT_CREDENTIALS_ONLY="1"; python scripts\ga-live-sort-smoke.py
# restart backend so overrides load
$env:GA_LIVE_SORT_SKIP_CREDENTIALS="1"; python scripts\ga-live-sort-smoke.py
```

## Phase 3 — Closed beta (1 week)

| Gate | Pass |
|------|------|
| Real users | 5 entitled accounts sort daily for 7 days |
| Error budget | <5% analyze failures attributable to LLM/queue |
| Support load | No P0 “sort completely broken” incidents |
| Daily health probe | `npm run ga:beta-health` — green for 7 days |

```bash
npm run ga:beta-health
npm run ga:beta-health:prometheus   # after SORT_PROMETHEUS_ENABLED=1 on VPS
```

## Phase 3b — Corpus accuracy (pre open beta)

| Gate | Pass |
|------|------|
| Fixture eval ±2% | `npm run ga:staging-fixture-gate` vs recorded baseline |
| Structure templates | `bash scripts/verify-sort-structure-templates.sh` — all `test_sort_structure*.py` green |
| Hilal structure KPI (manual) | 25 JPG batch: uncertain ≤20%, Building-32 property folders ≤2 names, 0 errors |
| Sort intelligence roadmap | Phases 0–2 in [SORT_INTELLIGENCE_ROADMAP.md](SORT_INTELLIGENCE_ROADMAP.md) before claiming global accuracy wins |

| Real corpus ±2% | `npm run ga:corpus-compare -- baseline.csv staging.csv` |

Record baseline after a known-good staging run:

```bash
python scripts/ga-staging-fixture-gate.py --write-baseline
```

## Phase 4 — Production cutover

| Gate | Pass |
|------|------|
| Prod TLS | `llm.exosites.ch` liveliness 200 |
| Parity | Same `SORT_LLM_QUEUE_*` policy on prod VPS |
| Monitoring | Prometheus scrapes queue metrics; alerts wired |

Enable on VPS:

```bash
npm run ga:enable-prometheus-vps   # Windows; or ./scripts/enable-prometheus-staging.sh on VPS
```

## Recorded baselines

See `docs/CAPACITY_BASELINE.md` and `docs/GA_EXECUTION_LOG.md` for dated JSON reports under `reports/sort-capacity/`.

## Current verdict (update after each run)

- **Closed beta (5 concurrent cloud sorters):** ready when Phase 0 + Phase 1 queue baseline + Phase 1b live sort pass.
- **Unlimited SaaS GA:** not claimed — requires Phase 3 beta + corpus eval (±2% vs gold).
