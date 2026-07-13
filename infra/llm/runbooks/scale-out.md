# Runbook: scale out sort LLM

Use when load tests show rising p95 latency or 503 rate > 1% with 5+ concurrent users.

## Symptoms

- `ga-sort-concurrency-load-test.py` fails p95 or error-rate gates
- Grafana / logs: Ollama queue depth high, GPU memory > 85%
- Users report slow sort but jobs eventually complete

## Step 1 — Split embed from chat (low cost)

Embedding rerank calls no longer compete with classify/vision on the chat GPU.

```bash
cd infra/llm
docker compose \
  -f compose/docker-compose.minimal-staging.yml \
  -f compose/docker-compose.split-embed-overlay.yml \
  --env-file .env up -d
./scripts/pull-models.sh
```

## Step 2 — Redis + distributed LiteLLM limits

```bash
docker compose \
  -f compose/docker-compose.yml \
  -f compose/docker-compose.redis-overlay.yml \
  --env-file .env up -d
```

Set in `.env`: `REDIS_HOST=redis`, `REDIS_PORT=6379` (injected by overlay).

## Step 3 — Second chat instance (horizontal)

Requires a second GPU or sufficient VRAM headroom on the host.

```bash
docker compose \
  -f compose/docker-compose.yml \
  -f compose/docker-compose.scale-overlay.yml \
  -f compose/docker-compose.redis-overlay.yml \
  --env-file .env up -d
./scripts/pull-models.sh
```

LiteLLM `config.scalable.yaml` registers duplicate `model_name` entries; router `simple-shuffle` spreads load.

## Client-side knobs (no VPS change)

Cloud sign-in pushes these from `POST /v1/sort/credentials`:

| Field | Desktop env | Default |
|-------|-------------|---------|
| `llm_max_slots` | `EXOSITES_LLM_MAX_SLOTS` | 2 |
| `sort_max_concurrency` | `EXOSITES_SORT_MAX_CONCURRENCY` | 1 |

Raise VPS `SORT_CLOUD_SORT_CONCURRENCY` only after load tests pass with headroom.

## Step 4 — Enable Redis fair queue (recommended at 5+ active sorters)

```bash
docker compose \
  -f compose/docker-compose.yml \
  -f compose/docker-compose.redis-overlay.yml \
  -f compose/docker-compose.queue-overlay.yml \
  -f compose/docker-compose.sort-credentials-broker.yml \
  --env-file .env up -d
```

In `.env`:

```bash
SORT_LLM_QUEUE_ENABLED=1
SORT_QUEUE_WORKERS=4   # match OLLAMA_NUM_PARALLEL headroom
```

Reload Caddy (includes `/v1/sort/inference` route). Desktops receive `queue_url` on next credential sync; classify/embed route through the queue automatically. Model list and health still hit LiteLLM directly.

## Verify

```bash
python3 scripts/ga-sort-concurrency-load-test.py
USERS=10 REQUESTS_PER_USER=2 MAX_ERROR_RATE=0.05 python3 scripts/ga-sort-concurrency-load-test.py
```

## Rollback

Remove scale/redis overlays and redeploy base compose; flip `SORT_CLOUD_SORT_CONCURRENCY=1`.
