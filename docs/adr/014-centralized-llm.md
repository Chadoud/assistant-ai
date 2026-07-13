# ADR-014: Centralized LLM inference (Ollama + LiteLLM)

## Status

Proposed (2026-06-18) — see [OLLAMA_IMPLEMENTATION_PLAN.md](../OLLAMA_IMPLEMENTATION_PLAN.md)

## Context

Exo runs `ollama serve` per desktop (`electron/ollama.js`). Each user needs local GPU/RAM, models are duplicated, and there is no auth, quota, or audit trail. Multi-user production requires shared inference on `llm.exosites.ch`.

Ollama has no built-in multi-tenancy; vLLM may be needed later for chat scale.

## Decision

1. **Inference island** on a dedicated GPU host: Ollama (chat + embed) behind **LiteLLM** and **Caddy** TLS. Ollama port 11434 is never public.
2. **Exo backend** is the only production caller — new `backend/llm/ollama_client.py` speaks OpenAI-compatible `/v1` to LiteLLM with virtual keys.
3. **Desktop** keeps local Ollama for dev (`OLLAMA_MODE=local`); production defaults to `remote` with no prod keys in Electron.
4. **Day 1 stack:** Docker Compose, not Kubernetes. **Phase 2:** Redis queue for sort fairness. **Phase 3:** vLLM for chat if SLO breached.
5. **Models:** `mistral` (classify), `nomic-embed-text` (rerank) — pinned in `infra/llm/models/models.yaml`.

## Consequences

- Infra repo path: `infra/llm/` (Compose, configs, runbooks).
- Env: `OLLAMA_MODE`, `OLLAMA_HOST`, `OLLAMA_API_KEY`, `EXOSITES_REMOTE_LLM`.
- Local dev unchanged; CI can use `OLLAMA_EVAL=0` or remote staging.
- Voice/agent stays on Gemini — GPU planning is sort + embed only.
- Rollback: flip `EXOSITES_REMOTE_LLM=0` + `OLLAMA_MODE=local`.

## References

- [OLLAMA_PRODUCTION_DEPLOYMENT.md](../OLLAMA_PRODUCTION_DEPLOYMENT.md)
- [OLLAMA_IMPLEMENTATION_PLAN.md](../OLLAMA_IMPLEMENTATION_PLAN.md)
