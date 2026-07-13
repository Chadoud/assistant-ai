# Sort capacity baseline



Ops record for **5 concurrent cloud sorters** — the GA concurrency target on the current VPS.



## Run (staging)



```bash

# Direct LiteLLM (queue off)

./scripts/ga-sort-capacity-baseline.sh



# With Redis fair queue enabled on VPS

USE_SORT_QUEUE=1 ./scripts/ga-sort-capacity-baseline.sh

```



Requires `LITELLM_MASTER_KEY` in `cloud-node/.env` or environment.



Optional: `VPS_SSH_KEY` set so queue mode auto-flushes stale Redis jobs before the run.



Reports land in `reports/sort-capacity/sort-capacity-{direct|queue}-*.json`.



## SLO gates (defaults)



| Scenario | Pass criteria |

|----------|----------------|

| **5 users** | error_rate ≤ 15%, p95 ≤ 120s |



Tune via env: `BASELINE_MAX_ERROR_RATE`, `BASELINE_MAX_P95_MS`, `BASELINE_USERS` (default `5`).



## Recorded baselines (staging, 2026-06-20)



| Mode | Users | p50 | p95 | error_rate | Pass |

|------|-------|-----|-----|------------|------|

| direct | 5 | 8.8s | 9.6s | 0% | yes (2026-06-20) |
| queue | 5 | 9.7s | 10.7s | 0% | yes (2026-06-20) |

Baseline uses 5 users × `llm_max_slots=2` stress. Production admission keeps `sort_max_concurrency=1` (one file row per user = lower real load).



## When to enable queue



Enable `SORT_LLM_QUEUE_ENABLED=1` when **direct** baseline at 5 users shows:



- p95 climbing above 60s, or

- error_rate > 1%, or

- LiteLLM/Ollama 503s in logs



Queue is **enabled on staging** and recommended for fair multi-user load.



## Enable queue on staging (once)



```bash

# Mac/Linux — set host + key from your secrets store (never commit)

VPS_SSH=ubuntu@YOUR_LLM_VPS_IPV4 VPS_SSH_KEY="$HOME/.ssh/exo_llm_vps" \

  ./scripts/package-llm-ga-to-vps.sh --run-enable-queue



# Windows PowerShell

$env:VPS_SSH = "ubuntu@YOUR_LLM_VPS_IPV4"

$env:VPS_SSH_KEY = "C:\path\to\vps_ssh_key"

.\scripts\deploy-sort-queue-staging.ps1

```



Verify: `./scripts/verify-sort-ga-readiness.sh` — expect `queue_url` in credentials and `GET …/v1/sort/queue/health` → 200.



## VPS knobs for 5 users



| Setting | Recommended | Purpose |

|---------|-------------|---------|

| `SORT_LLM_MAX_PARALLEL` | 2 | LiteLLM slots per user |

| `SORT_CLOUD_SORT_CONCURRENCY` | 1 | One file row at a time per user |

| `SORT_QUEUE_WORKERS` | 4 | Fair queue drain (≥ concurrent users) |

| `OLLAMA_NUM_PARALLEL` | 2 | Global Ollama inference cap |



## Monitoring

- Queue health: `GET https://llm-staging.exosites.ch/v1/sort/queue/health`
- Daily beta bundle: `npm run ga:beta-health`
- Prometheus on VPS (localhost:9090): `npm run ga:enable-prometheus-vps` then `npm run ga:beta-health:prometheus`
- Metrics: `sort_queue_pending_jobs`, `sort_queue_timeouts_total`
- Alerts: `infra/llm/prometheus/alerts.yml` → SortQueueBacklog, SortQueueTimeouts

See `infra/llm/runbooks/503-storm.md` and `scale-out.md`.


