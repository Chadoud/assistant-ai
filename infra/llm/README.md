# Exosites centralized LLM infrastructure

Deploy Ollama + LiteLLM (+ optional Caddy TLS) for staging or production.

## Infomaniak Cloud Server (current staging)

Infomaniak attaches **250 GB** at `/mnt/data` — separate from the **~20 GB** system disk (`/`).

| Mount | Size | Use |
|-------|------|-----|
| `/` | ~20 GB | OS only — keep lean |
| `/mnt/data` | 250 GB | Docker, containerd, Ollama models |

**One-shot deploy:**

```bash
cd infra/llm
./scripts/deploy-infomaniak.sh
```

Compose files:

```bash
docker compose \
  -f compose/docker-compose.minimal-staging.yml \
  -f compose/docker-compose.infomaniak.yml \
  --env-file .env up -d
```

External API (staging, HTTP): `http://<server-ip>:4000` — protect with `OLLAMA_API_KEY` / LiteLLM master key.

### HTTPS (after DNS)

1. Add **A record**: `llm-staging.exosites.ch` → server IPv4 (`YOUR_LLM_VPS_IPV4`).
2. Open Infomaniak firewall **TCP 80** and **443** (same source IP as port 4000).
3. On the server:

```bash
cd ~/exo-llm
./scripts/enable-tls-staging.sh
```

4. In Exo: Settings → **Sort LLM location** → set host to `https://llm-staging.exosites.ch`, Save.

Until DNS is live, use `https://llm-staging.exosites.ch` (TLS via Caddy). Do **not** use `http://<IP>:4000` from off-VPS clients — port 4000 is firewalled.

## Generic GPU / NVMe host

```bash
cd infra/llm
cp .env.example .env
./scripts/bootstrap.sh
docker compose -f compose/docker-compose.yml -f compose/docker-compose.staging-cpu.yml --env-file .env up -d
./scripts/pull-models.sh
./scripts/smoke-test.sh
```

## Layout

```
infra/llm/
├── compose/
│   ├── docker-compose.yml              # full stack (GPU reference)
│   ├── docker-compose.minimal-staging.yml
│   └── docker-compose.infomaniak.yml   # bind /mnt/data/ollama
├── litellm/
│   ├── config.yaml
│   └── config.minimal.yaml
├── scripts/
│   ├── deploy-infomaniak.sh
│   ├── install-host-infomaniak.sh
│   ├── migrate-containerd-to-data.sh
│   ├── pull-models.sh
│   └── smoke-test.sh
└── runbooks/
```

## Operations

| Action | Command |
|--------|---------|
| Logs | `sudo docker compose -f compose/docker-compose.minimal-staging.yml -f compose/docker-compose.infomaniak.yml logs -f litellm` |
| Restart Ollama | `sudo docker restart ollama` |
| Pull models | `./scripts/pull-models.sh` |
| Smoke test | `./scripts/smoke-test.sh` |
| Load test (5 users) | `python3 ../../scripts/ga-sort-concurrency-load-test.py` |
| Free root disk | `./scripts/migrate-containerd-to-data.sh` |

## Scale-out (multi-user production)

| Tier | Compose overlays | When |
|------|------------------|------|
| **Fair embed isolation** | `docker-compose.split-embed-overlay.yml` + `config.minimal-split.yaml` | Embed storms evict chat model |
| **Distributed rate limits** | `docker-compose.redis-overlay.yml` | Multiple LiteLLM replicas or strict RPM |
| **Horizontal chat** | `docker-compose.scale-overlay.yml` + `config.scalable.yaml` | Sustained >4 concurrent classify slots |
| **Redis fair queue** | `docker-compose.queue-overlay.yml` + `SORT_LLM_QUEUE_ENABLED=1` | 5+ users; prevents Ollama overload |

Example production stack:

```bash
docker compose \
  -f compose/docker-compose.yml \
  -f compose/docker-compose.split-embed-overlay.yml \
  -f compose/docker-compose.redis-overlay.yml \
  -f compose/docker-compose.scale-overlay.yml \
  --env-file .env up -d
```

See [`runbooks/scale-out.md`](runbooks/scale-out.md) and [`docs/SORT_THROUGHPUT.md`](../../docs/SORT_THROUGHPUT.md).

## Exo desktop

Settings → **AI models** → **Sort LLM location** → Cloud, set host + API key, Save (restarts backend).

See [`docs/OLLAMA_IMPLEMENTATION_PLAN.md`](../../docs/OLLAMA_IMPLEMENTATION_PLAN.md).

Client keys and rotation: [`docs/CLIENT_KEYS.md`](docs/CLIENT_KEYS.md).
