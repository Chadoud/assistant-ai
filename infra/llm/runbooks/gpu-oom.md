# Runbook: GPU OOM

**Alert:** GPU memory >90%, Ollama restart loop

## Causes

- `OLLAMA_NUM_PARALLEL` too high for VRAM + context length
- New model quant (e.g. Q8) loaded alongside another
- User/context abuse (32k ctx) — cap at LiteLLM

## Fix

1. `nvidia-smi` — confirm Ollama PID holds most VRAM
2. Set `OLLAMA_NUM_PARALLEL=2` (or lower)
3. Ensure `OLLAMA_MAX_LOADED_MODELS=1`
4. Restart: `docker compose restart ollama-chat`
5. Verify: `./scripts/smoke-test.sh`

## Prevent

- Alert at 85% GPU memory
- Document max safe `NUM_PARALLEL` per GPU tier in deployment doc
- Block large models for default API keys in LiteLLM
