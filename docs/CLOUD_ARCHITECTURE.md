# Cloud architecture — api.exosites.ch vs LLM VPS

## Roles (both needed)

| Host | Role | Why separate |
|------|------|----------------|
| **api.exosites.ch** (Infomaniak Node + MariaDB) | Accounts, Google/Apple auth, trials, entitlements, GO SYNC relay | Managed SSL, DB, auth — not for GPU inference |
| **llm-staging.exosites.ch** (Infomaniak Cloud Server VPS) | Ollama + LiteLLM inference, **virtual key minting** | Heavy models, Docker, `/key/generate` with Postgres |

**Desktop flow**

1. Sign in → `api.exosites.ch` (JWT)
2. Mint sort token → `llm-staging.exosites.ch/v1/sort/credentials` (broker validates JWT via `api.exosites.ch/v1/me`, mints key on localhost LiteLLM)
3. Sort files → LiteLLM on VPS with short-lived virtual key (text classify, embeddings, and vision when OCR is thin)
4. Tesseract OCR still runs **locally** on the desktop; vision LLM fallback (e.g. `moondream`) runs on the **same VPS sort stack** when OCR returns no text

## Multi-user scalability

**GA target: 5 concurrent cloud sorters** on the current VPS (`docs/CAPACITY_BASELINE.md`).

| Layer | Mechanism |
|-------|-----------|
| **Per-user virtual key** | LiteLLM `max_parallel_requests` (default 2) |
| **Desktop admission** | `EXOSITES_LLM_MAX_SLOTS` + `EXOSITES_SORT_MAX_CONCURRENCY` synced on sign-in |
| **Fair default** | `sort_max_concurrency: 1` — one file row at a time per user |
| **Client backpressure** | Semaphore wait + 503 jitter retries before failing a row |
| **Redis fair queue (optional)** | `POST /v1/sort/inference` → workers → LiteLLM; round-robin per user |
| **VPS scale-out** | Optional split embed, Redis rate limits, second `ollama-chat` via compose overlays |

Load test: `python3 scripts/ga-sort-concurrency-load-test.py`. Scale runbook: `infra/llm/runbooks/scale-out.md`.

## Why credentials moved to the VPS

Infomaniak **web hosting** (where `api.exosites.ch` runs) **cannot open HTTPS** to the LLM VPS (`YOUR_WEB_HOST_IPV4 → YOUR_LLM_VPS_IPV4` times out). Desktops and the VPS itself can.

Senior layout: **auth on Infomaniak, inference + key mint on VPS**, not “replace api with VPS.”

## Optional later

- Point `llm.exosites.ch` at production VPS when ready
- Open Cloud Server firewall if you want `api.exosites.ch` to mint keys server-side again (not required with broker)
- Rotate `LITELLM_MASTER_KEY` (Section A in `SAAS_SORT_UX_PLAN.md`)

## Ops

```bash
# Deploy broker + Caddy route on VPS
VPS_SSH=ubuntu@YOUR_LLM_VPS_IPV4 ./scripts/package-llm-ga-to-vps.sh --run-enable

# Verify GA (credentials via LLM gateway)
./scripts/verify-sort-ga-readiness.sh
```
