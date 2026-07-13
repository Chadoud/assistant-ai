# Runbook: Model deploy / upgrade

## Preconditions

- New tag in `models/models.yaml`
- Staging smoke + `classify_eval` parity on Exo staging

## Steps

1. Staging: `./scripts/pull-models.sh` with `CHAT_MODEL=mistral:new-tag`
2. LiteLLM: add canary route or swap `model_list` entry
3. `./scripts/warmup.sh`
4. `./scripts/smoke-test.sh`
5. Exo staging sort eval — accuracy within ±2%
6. Prod: repeat during low-traffic window
7. Monitor p95 latency 1h; rollback LiteLLM config if regression

## Rollback

1. Revert `litellm/config.yaml` to previous `api_base` / model tag
2. `docker compose restart litellm`
3. Old model stays in volume until manual `ollama rm`
