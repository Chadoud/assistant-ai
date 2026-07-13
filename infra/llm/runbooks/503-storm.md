# Runbook: 503 storm

**Alert:** `LiteLLMHighErrorRate`, user reports "sort stuck" / "LLM unavailable"

## Symptoms

- LiteLLM returns **503** or high **429**
- Grafana: queue depth up, GPU memory >90%
- Ollama logs: OOM, "queue full"

## Immediate (5 min)

1. Check GPU: `nvidia-smi` on host — memory %, processes
2. Check Ollama: `docker logs ollama-chat --tail 100`
3. Check LiteLLM: `docker logs litellm --tail 100`
4. If OOM: `docker compose restart ollama-chat` (drops in-flight; Exo retries)

## Mitigate (15 min)

1. Lower `OLLAMA_NUM_PARALLEL` in `.env` (e.g. 4 → 2); `docker compose up -d ollama-chat`
2. Reduce LiteLLM per-key RPM in admin UI
3. Ask Exo team to lower `EXOSITES_LLM_MAX_SLOTS` temporarily

## Scale

- Add second GPU instance + LiteLLM router entry (architecture doc §4)
- Or enable Redis sort queue (phase 2)

## Post-incident

- Record peak concurrent slots vs capacity
- Update capacity table if sustained load changed
