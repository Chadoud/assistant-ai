# Centralized LLM — Implementation Plan

**Companion to:** [`OLLAMA_PRODUCTION_DEPLOYMENT.md`](./OLLAMA_PRODUCTION_DEPLOYMENT.md)  
**Infra scaffold:** [`../infra/llm/`](../infra/llm/)  
**Status:** Ready to execute (June 2026)

This document turns the architecture into a **6-week delivery plan** with owners, acceptance criteria, and Exo repo changes. If a section here conflicts with the architecture doc, **this plan wins for sequencing**; architecture wins for design.

---

## Completeness checklist

| Area | Architecture doc | This plan | Infra scaffold |
|------|------------------|-----------|----------------|
| Reference architecture | ✅ | ✅ | — |
| Capacity / cost | ✅ | ✅ | — |
| Docker Compose (runnable) | partial snippet | ✅ | ✅ `infra/llm/` |
| LiteLLM config | mentioned | ✅ | ✅ |
| Caddy / TLS | snippet | ✅ | ✅ |
| Prometheus alerts | mentioned | ✅ | ✅ |
| Runbooks | titles only | ✅ | ✅ `infra/llm/runbooks/` |
| SLO / error budget | one line | ✅ | — |
| Environments (dev/stg/prod) | — | ✅ | ✅ |
| Security & secrets | partial | ✅ | — |
| DR / backup | — | ✅ | — |
| Exo client contract (retry, env) | table | ✅ | — |
| 6-week phases & owners | chat only | ✅ | — |
| Testing / rollout gates | partial | ✅ | — |
| Ticket backlog | — | ✅ | — |
| vLLM migration path | ✅ | ✅ | — |

**Verdict:** Architecture was **~70% complete** for execution. Gaps above are now filled.

---

## Team & ownership

| Role | Owns | Backup |
|------|------|--------|
| **Platform lead** | `infra/llm/`, GPU host, Caddy, deploy CI | SRE |
| **Gateway owner** | LiteLLM, keys, quotas, Postgres | Platform lead |
| **Exo backend owner** | `backend/llm/ollama_client.py`, job admission | Classifier owner |
| **Exo desktop owner** | `electron/ollama.js`, Settings UI | Backend owner |
| **QA / eval owner** | `classify_eval` gates, load tests | Backend owner |

**Cadence:** 30 min weekly ops review (GPU, 503, cost); daily Slack during rollout weeks 5–6.

---

## Environments

| Env | Host | Ollama | Keys | Exo flag |
|-----|------|--------|------|----------|
| **local** | `127.0.0.1:11434` | Desktop `ollama serve` | none | `OLLAMA_MODE=local` |
| **staging** | `llm-staging.exosites.ch` or VPS IP | Shared CPU (Infomaniak: 250 GB at `/mnt/data`) | `exo-backend-staging` | `EXOSITES_REMOTE_LLM=1` |
| **production** | `llm.exosites.ch` | Dedicated GPU | `exo-backend-prod` | `EXOSITES_REMOTE_LLM=1` (default GA) |

**Rule:** Staging must run the **same model tags** as prod (`infra/llm/models.yaml`); only rate limits differ.

---

## SLOs & error budget

| SLI | Target (prod) | Measurement |
|-----|---------------|-------------|
| Availability | **99.5%** monthly | LiteLLM 2xx / total (excl. 429) |
| Classify latency | **p95 < 10s** @ 4k ctx, 7B | Backend `ollama_client` histogram |
| Error rate | **< 1%** 5xx | LiteLLM + backend |
| 503 (overloaded) | **< 0.5%** | LiteLLM; triggers scale review |

**Error budget:** 0.5% monthly ≈ 3.6h downtime. Burn >50% in week 1 → freeze feature work, fix capacity.

---

## Phase 0 — Decisions (days 1–2)

**Tickets**

- [ ] ADR-014: Centralized LLM via LiteLLM + Ollama v1
- [ ] Sign off SLO table above
- [ ] Pick GPU provider (Hetzner GEX44 / OVH GPU / existing `api.exosites.ch` metal)
- [ ] Create secrets: `LITELLM_MASTER_KEY`, `exo-backend-staging`, `exo-backend-prod` in Vault

**Exit:** ADR merged; staging DNS requested.

---

## Phase 1 — Inference island (week 1–2)

**Owner:** Platform lead

**Tasks**

1. Provision GPU VPS; run `infra/llm/scripts/bootstrap.sh`
2. Deploy `docker compose -f infra/llm/compose/docker-compose.yml up -d`
3. `scripts/pull-models.sh` → `mistral`, `nomic-embed-text`
4. `scripts/smoke-test.sh` against staging URL
5. Wire Prometheus + Grafana; import dashboard JSON (optional phase 1.5)
6. Configure Cloudflare / firewall per architecture doc

**Acceptance**

- [ ] `curl -H "Authorization: Bearer $KEY" https://llm-staging.exosites.ch/v1/chat/completions` returns 200
- [ ] Embed endpoint returns vector for `nomic-embed-text`
- [ ] Port 11434 not reachable from internet (nmap)
- [ ] Load test: 8 parallel classify-sized prompts, p95 < 15s, 0 OOM
- [ ] Runbook `503-storm.md` reviewed by on-call

**No Exo code changes.**

---

## Phase 2 — Exo backend client (week 2–3)

**Owner:** Exo backend owner

### 2.1 New module: `backend/llm/ollama_client.py`

**Public API**

```python
def chat(messages, *, model, options=None, timeout_s=None) -> dict
def embed(prompt, *, model="nomic-embed-text") -> list[float]
def list_models() -> list[str]
def health_check() -> bool
```

**Behavior**

- Read `OLLAMA_MODE`, `OLLAMA_HOST`, `OLLAMA_API_KEY`, `OLLAMA_REQUEST_TIMEOUT_S`
- Use OpenAI-compatible client pointed at LiteLLM `/v1` when `remote`
- Retry 429/503: exponential backoff, max 3, jitter; respect `Retry-After`
- Log: `request_id`, `model`, `latency_ms`, `status`, `prompt_tokens`, `completion_tokens` (no prompt body)
- Pass `X-Request-ID` from FastAPI middleware

### 2.2 Wire callers

| File | Change |
|------|--------|
| `classifier.py` | `ollama_client.chat` |
| `semantic_rerank.py` | `ollama_client.embed` |
| `classifier_ollama.py` | Remote: proxy `list_models` or disable pull |
| `health_checks.py` | Remote-aware `/ready` |
| `ollama_routes.py` | Gate pull/delete to `local` mode only |

### 2.3 Env (`.env.example`)

```bash
OLLAMA_MODE=remote          # local | remote
OLLAMA_HOST=https://llm-staging.exosites.ch
OLLAMA_API_KEY=             # LiteLLM virtual key; never commit
OLLAMA_DEFAULT_MODEL=mistral
OLLAMA_REQUEST_TIMEOUT_S=120
OLLAMA_MAX_RETRIES=3
EXOSITES_REMOTE_LLM=0         # 1 in staging/prod
EXOSITES_LLM_MAX_SLOTS=4      # server-side admission (phase 4)
```

**Acceptance**

- [ ] All `test_classifier_*` pass with mocks
- [ ] Staging Exo sorts 100-file fixture set; accuracy within ±2% of local baseline (`classify_eval`)
- [ ] `/ready` reports `ollama: ok` when remote reachable

---

## Phase 3 — Desktop cutover (week 3–4)

**Owner:** Exo desktop owner

| Task | File |
|------|------|
| Skip `ollama serve` when remote | `electron/ollama.js`, `electron/main.js` | ✅ |
| Pass `OLLAMA_MODE` to backend child | `electron/backendProcess.js` | ✅ |
| Settings: Local vs Cloud LLM | `frontend/.../RemoteLlmSection.tsx` | ✅ |
| Test connection button | calls backend `/ready` | ✅ |
| Setup wizard: skip Ollama install if cloud | `electron/setup/runSetup.js` | ✅ |
| Dev launchers skip Ollama when remote | `start-dev.sh`, `start-dev.ps1` | ✅ |
| Sort pipeline skips local model install gate | `analysisModelReadiness.ts` | ✅ |

**Acceptance**

- [x] Fresh install + `OLLAMA_MODE=remote`: no Ollama binary required; sort works
- [x] `OLLAMA_MODE=local`: unchanged behavior for devs
- [x] Model pull UI disabled in remote mode with plain-language copy

**Still local (by design):** Tesseract OCR, file I/O, folder moves, optional vision fallback (local Ollama only until cloud vision is added).

---

## Phase 4 — Fairness (week 4–5)

**Owner:** Exo backend owner

1. **Admission control:** semaphore `EXOSITES_LLM_MAX_SLOTS` in job analyze path ✅ (`ollama_client` + `llm/admission.py`)
2. **Align** with `EXOSITES_SORT_MAX_CONCURRENCY` — server cap wins in remote mode ✅
3. **Optional:** Redis queue if load test shows 503 > 0.5%

**Acceptance**

- [ ] 15 concurrent sort simulations: 503 < 1%, no OOM on GPU dashboard
- [x] `GET /ready` includes `llm_admission` summary

---

## Phase 5 — Production rollout (week 5–6)

| Step | Cohort | Action |
|------|--------|--------|
| 1 | Internal | `EXOSITES_REMOTE_LLM=1` + `OLLAMA_MODE=remote` |
| 2 | Beta 10% | Feature flag in update channel |
| 3 | Beta 50% | Monitor SLO 48h |
| 4 | GA | Default remote; local opt-in in Settings |

**Rollback (one switch)**

```bash
EXOSITES_REMOTE_LLM=0
OLLAMA_MODE=local
```

**Acceptance**

- [ ] 7 days GA: SLO green, no P0 incidents
- [ ] Postmortem template unused (ideal)

---

## Testing matrix

| Test | When | Owner |
|------|------|-------|
| `infra/llm/scripts/smoke-test.sh` | Every infra deploy | CI |
| `pytest backend/tests/test_*ollama*` | Every app PR | CI |
| `classify_eval.run_eval` | Model tag change | QA |
| 8-parallel load (k6 or locust) | Before prod; before raising `NUM_PARALLEL` | Platform |
| Desktop E2E sort smoke | Before GA | QA |

---

## Security (implementation requirements)

| Control | Implementation |
|---------|----------------|
| TLS | Caddy ACME; HSTS |
| Secrets | Vault / host env; never in git; SOPS for `infra/llm/.env` |
| Network | Ollama on `internal` Docker network only |
| Auth | LiteLLM virtual keys; master key for admin only |
| Audit | LiteLLM Postgres spend/logs; 90d retention |
| Egress | Optional: block Ollama container egress except deploy window |
| Desktop | **No** production LLM keys in Electron |

---

## Disaster recovery

| Asset | RPO | RTO | Procedure |
|-------|-----|-----|-----------|
| Model weights (NVMe) | 24h | 4h | Re-run `pull-models.sh` from manifest |
| LiteLLM config | 0 | 30m | Git revert + redeploy |
| Postgres (keys/audit) | 1h | 1h | Daily snapshot |
| GPU host loss | — | 8h | Provision spare; restore compose; pull models |

**Backup:** nightly `rsync` of `/mnt/nvme/ollama` to object storage (optional; models are re-pullable).

---

## Ticket backlog (copy to Linear/Jira)

### Infra (P0)

- INF-1 Provision staging GPU/CPU host
- INF-2 Deploy compose stack staging
- INF-3 DNS `llm-staging.exosites.ch`
- INF-4 Prometheus + alert rules
- INF-5 Prod host + `llm.exosites.ch`
- INF-6 Load test report

### Backend (P0)

- BE-1 `ollama_client.py` + tests
- BE-2 Migrate `classifier.py` / `semantic_rerank.py`
- BE-3 Remote health checks
- BE-4 `EXOSITES_REMOTE_LLM` flag
- BE-5 LLM admission semaphore
- BE-6 `.env.example` + docs

### Desktop (P1)

- DT-1 Remote mode in `ollama.js`
- DT-2 Settings UI local/cloud
- DT-3 Setup wizard branch

### QA (P1)

- QA-1 Baseline `classify_eval` on local
- QA-2 Staging remote parity report
- QA-3 Rollout monitoring checklist

---

## vLLM phase (deferred, designed now)

When p95 > 10s at <20 concurrent slots or 503 > 1% sustained:

1. Add `vllm` service to compose
2. LiteLLM route `mistral` → `openai/` backend at vLLM
3. Exo `ollama_client` unchanged (already OpenAI-compatible)
4. Retire Ollama chat container; keep embed on Ollama CPU

---

## Related

- [`OLLAMA_PRODUCTION_DEPLOYMENT.md`](./OLLAMA_PRODUCTION_DEPLOYMENT.md) — architecture deep dive
- [`../infra/llm/README.md`](../infra/llm/README.md) — deploy commands
- [`SORT_THROUGHPUT.md`](./SORT_THROUGHPUT.md) — sort concurrency knobs
