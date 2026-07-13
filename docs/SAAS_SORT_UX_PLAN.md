# SaaS sort UX — remediation plan

**Problem:** Settings still speak like a local Ollama dev setup (API keys, “Cloud LLM URL”, local/cloud toggles, Ollama model list warnings) while production sort runs on **Exo infrastructure**.

**North star:** A subscriber opens Exo, sorts files, and never sees LiteLLM, Ollama, API keys, or server URLs.

**Current posture (2026-06-19):** Product code for Phases 1–5 is in the repo. **Staging** (`llm-staging.exosites.ch` + `api.exosites.ch`) works with **`SORT_LLM_ALLOW_MASTER_DELEGATION=1`** — fine for you and a handful of testers, **not** safe for public subscribers (shared master token).

**Latest automated run:** see [`docs/GA_EXECUTION_LOG.md`](GA_EXECUTION_LOG.md) — cloud API verified; **blocker** is LiteLLM Postgres on VPS (`/key/generate` → 500).

---

## Phase 1 — Copy & hide dev controls — Done

---

## Phase 2 — Provision credentials server-side — Done (2026-06-19)

| Item | Action | Status |
|------|--------|--------|
| Entitlement API | `POST /v1/sort/credentials` → endpoint + short-lived token | **Done** (live) |
| Desktop bootstrap | On login + entitlement refresh → `backend-env-overrides.json` | **Done** (Electron) |
| Remove API key field | Blocked in packaged builds via IPC allowlist | **Done** (dev Advanced tab only) |
| `sortServiceMode` on entitlement | IPC + `/entitlement/status` scaffold | Done |
| Rotate keys | Ops-only on VPS + cloud-node `LITELLM_MASTER_KEY` | **Blocked — you** |
| Deploy cloud-node | Set `LITELLM_MASTER_KEY`, `SORT_LLM_BASE_URL` on Infomaniak | **Done** (verified 2026-06-19) |
| Per-user virtual keys (GA) | LiteLLM `/key/generate` via `cloud-node/lib/sortLlmCredentials.js` | **Code done — ops must enable** |

### Cloud API

```
POST /v1/sort/credentials
Authorization: Bearer <access_token>
→ { endpoint, token, expires_in, models, sort_service_mode, credentials_managed }
```

Env vars: see `cloud-node/.env.example` (`SORT_LLM_*`, `LITELLM_MASTER_KEY`).

Staging fallback: `SORT_LLM_ALLOW_MASTER_DELEGATION=1` only when LiteLLM `/key/generate` is unavailable.

---

## Phase 3 — Settings IA redesign — Done

---

## Phase 4 — Errors & edge cases — Done

**Connectivity fix (2026-06-18):** Bare `http://IP:4000` is firewalled off-VPS; only `https://llm-staging.exosites.ch` works from Mac. Backend now rewrites blocked hosts and prefers `backend/.env` over stale shell `OLLAMA_HOST`.

---

## Phase 5 — Welcome & empty states — Done

---

## Pre-launch checklist (GA)

Use this order. **Owner:** *You* = ops on Infomaniak/VPS/desktop; *Platform* = GPU host; *QA* = accuracy + E2E.

### A. Security & credentials (blocker — do before any public invite)

| # | Task | Owner | Done |
|---|------|-------|------|
| A1 | **Rotate** LiteLLM master key on VPS (`infra/llm/scripts/rotate-master-key.sh`) | You | [ ] |
| A2 | **Rotate** SSH keys / any secrets that appeared in chat or logs | You | [ ] |
| A3 | Set new `LITELLM_MASTER_KEY` in **Infomaniak** → Manager → Node.js → `api.exosites.ch` → Environment variables | You | [ ] |
| A4 | Confirm LiteLLM **`/key/generate`** works from cloud-node (see commands below) | You | [ ] |
| A5 | Set `SORT_LLM_ALLOW_MASTER_DELEGATION=0` on Infomaniak (production default in `.env.example`) | You | [ ] |
| A6 | Restart Node app in Infomaniak Manager after env change | You | [ ] |
| A7 | Re-run `./scripts/verify-cloud-auth-api.sh` — `POST /v1/sort/credentials → 200` and token **≠** master key prefix | You | [ ] |

**A1 — VPS (SSH to `YOUR_LLM_VPS_IPV4` or your LLM host):**

```bash
cd ~/exo-llm
./scripts/rotate-master-key.sh
# Copy the printed key → Infomaniak LITELLM_MASTER_KEY (A3)
```

**A4 — Prove virtual keys (from your Mac, master key only in shell — never commit):**

```bash
export LITELLM_MASTER_KEY='sk-exo-…'   # from Infomaniak / VPS .env
curl -sS -X POST "https://llm-staging.exosites.ch/key/generate" \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"key_alias":"ga-smoke","duration":"1d","models":["mistral","nomic-embed-text"],"max_parallel_requests":2}'
# Expect JSON with a distinct virtual key — not the master key
```

**A7 — Cloud API smoke:**

```bash
./scripts/verify-cloud-auth-api.sh https://api.exosites.ch
```

After A5, inspect one credentials response: `token` must be a **short-lived virtual key**, not the shared master.

---

### B. Desktop subscriber smoke (you, on a clean or reset profile)

| # | Task | Owner | Done |
|---|------|-------|------|
| B1 | Fresh install or clear overrides: remove manual `OLLAMA_API_KEY` / `OLLAMA_HOST` from Electron overrides if present | You | [ ] |
| B2 | Sign in to Exo account → entitlement refresh runs | You | [ ] |
| B3 | Confirm `backend-env-overrides.json` contains `EXOSITES_SORT_CREDENTIALS_MANAGED=1`, `OLLAMA_MODE=remote`, HTTPS `OLLAMA_HOST` | You | [ ] |
| B4 | Sort 10+ mixed files (PDF, image, text) — no local sort model download required | You | [ ] |
| B5 | Settings → File sorting: **no** API key field, **no** Ollama download UI for sort (vision/OCR local sections OK) | You | [ ] |
| B6 | If sorting scans: install local **vision** model under AI models → Photos & scans | You | [ ] |

**B3 — Overrides path (macOS):**

`~/Library/Application Support/EXO/backend-env-overrides.json`

---

### C. Quality gates (before calling it GA)

| # | Task | Owner | Done |
|---|------|-------|------|
| C1 | **Baseline** sort on local Ollama (or last known good) → export sort-plan CSV | QA | [ ] |
| C2 | **Same corpus** on staging remote (`OLLAMA_HOST=https://llm-staging.exosites.ch`) → export CSV | QA | [ ] |
| C3 | Compare with `classify_eval.summarize_export` — automation/safety within **±2%** | QA | [ ] |
| C4 | `cd backend && python -m classify_eval.kpi_guardrails --sort-plan classify_eval/fixtures/baseline_sort_plan.csv` (CI fixture) | QA | [ ] |
| C5 | Desktop E2E: `cd frontend && npm run test:e2e -- e2e/sortHappyPath.spec.ts` on cloud-configured build | QA | [ ] |
| C6 | Load: ~15 concurrent classify jobs — 503 rate &lt; 1%, GPU memory stable (see `docs/OLLAMA_IMPLEMENTATION_PLAN.md` Phase 4) | Platform | [ ] |

**C1–C3 — From repo `backend/`:**

```bash
python -m classify_eval.summarize_export /path/to/local-baseline.csv
python -m classify_eval.summarize_export /path/to/staging-run.csv --gold /path/to/gold.json
```

Record `automation_rate` and `safety_rate_labeled_auto` in a ticket; delta must stay within ±2%.

---

### D. Production infrastructure (when leaving staging-only)

| # | Task | Owner | Done |
|---|------|-------|------|
| D1 | Provision **`llm.exosites.ch`** GPU host (see `docs/OLLAMA_PRODUCTION_DEPLOYMENT.md`) | Platform | [ ] |
| D2 | Point Infomaniak `SORT_LLM_BASE_URL=https://llm.exosites.ch` | You | [ ] |
| D3 | TLS + firewall: Ollama not on public `:4000`; only HTTPS gateway | Platform | [ ] |
| D4 | LiteLLM spend/logs retention (Postgres stack optional but recommended) | Platform | [ ] |
| D5 | Monitoring: `/health`, queue depth, GPU util, 5xx rate | Platform | [ ] |

Until D1–D2, you can **beta** on staging VPS with a **small** invited cohort only — not open marketing.

---

### E. Rollout & product (public)

| # | Task | Owner | Done |
|---|------|-------|------|
| E1 | **Internal** — team on remote sort 1 week | You | [ ] |
| E2 | **Beta ~10%** — update channel / feature flag | You | [ ] |
| E3 | **Beta ~50%** — monitor 48h SLO | You | [ ] |
| E4 | **GA** — default remote for new installs; local opt-in under Settings → Advanced | You | [ ] |
| E5 | **7 days GA** — no P0 incidents (`docs/OLLAMA_IMPLEMENTATION_PLAN.md` Phase 5) | You | [ ] |
| E6 | **Gemini** — billing or throttle for chat/voice (separate from sort VPS) | You | [ ] |
| E7 | **Copy audit** — cloud mode must not surface “Ollama”, “API key”, “LiteLLM” in sort paths (grep `frontend/src` + spot-check signed-in UI) | You | [ ] |

**Rollback (one switch per desktop / overrides):**

```json
{
  "EXOSITES_REMOTE_LLM": "0",
  "OLLAMA_MODE": "local"
}
```

Or revert Infomaniak `SORT_LLM_BASE_URL` and disable credentials route until fixed.

---

## Your action checklist (ops) — quick view

1. [x] **Restart** Infomaniak Manager → Node.js → `api.exosites.ch` → **Restart**
2. [x] **Verify** `./scripts/verify-cloud-auth-api.sh` — `features.sort_credentials=true`, `POST /v1/sort/credentials → 200`
3. [ ] **Sign in** on desktop → confirm sort works; overrides get `EXOSITES_SORT_CREDENTIALS_MANAGED=1`
4. [ ] **Remove** manual `OLLAMA_API_KEY` from overrides if any remain after sign-in smoke test
5. [ ] **Rotate** LiteLLM master key + SSH key (keys previously exposed in chat)
6. [ ] **Production GA:** `SORT_LLM_ALLOW_MASTER_DELEGATION=0` + virtual keys verified (Section A)
7. [ ] **Gemini quota** — billing or throttle voice/chat (separate from sort)
8. [ ] **Install vision model** locally if you sort scans (Photos & scans in Settings)
9. [ ] **Accuracy gate** — `classify_eval` ±2% (Section C)
10. [ ] **Production host** — `llm.exosites.ch` (Section D)

---

## Definition of done (GA)

- [ ] Fresh install, cloud account: sort works with **no** model download and **no** secret fields in Settings
- [ ] `POST /v1/sort/credentials` returns **per-user** virtual keys (`allowMasterDelegation=0`)
- [ ] `classify_eval` within ±2% of baseline on staging/production model
- [ ] No user-facing string contains “Ollama”, “API key”, or “LiteLLM” in **cloud sort** UI paths (audit Section E7)
- [ ] Dev/local mode under **Advanced** for engineers
- [x] `POST /v1/sort/credentials` live on api.exosites.ch (2026-06-19)
- [x] Desktop applies managed credentials on login (Electron `syncSortCredentialsFromCloud`)
- [x] Packaged builds cannot persist sort API keys via Settings IPC
- [x] Signed-in desktop subscribers see cloud sort UI (vision download/installed remain local)

---

## What subscribers never upload

Clarify for support and marketing:

| Stays on Mac | Runs on Exo cloud |
|--------------|-------------------|
| Files, folders, moves/copies | Classify + embed LLM calls |
| Tesseract OCR | (optional future: cloud vision) |
| Optional local vision for scans | Credential minting via `api.exosites.ch` |
| Gemini key for chat/voice (user-owned) | Account/trial entitlement |

Sort feels “slow” when remote LLM latency adds to local file read/OCR — that is expected until production GPU and caching are tuned.

---

## Related docs

- `docs/OLLAMA_IMPLEMENTATION_PLAN.md` — infra phases, load test, rollout
- `docs/OLLAMA_PRODUCTION_DEPLOYMENT.md` — `llm.exosites.ch` host setup
- `infra/llm/docs/CLIENT_KEYS.md` — virtual key curl examples
- `docs/accuracy-eval-playbook.md` — baseline + compare procedure
- `cloud-node/README.md` — Infomaniak env vars for sort credentials

