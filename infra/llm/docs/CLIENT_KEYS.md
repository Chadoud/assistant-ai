# Virtual keys and client credentials

## Minimal staging (no Postgres)

The minimal stack uses a single **`LITELLM_MASTER_KEY`** in `~/exo-llm/.env`. Exo desktop stores this as `OLLAMA_API_KEY` for staging only.

**Rotate when compromised:**

```bash
cd ~/exo-llm
./scripts/rotate-master-key.sh
```

Then update Exo: **Settings → AI models → Sort LLM location → API key → Save**.

## Production (Postgres + full compose)

Use LiteLLM virtual keys so desktops never hold the master key:

```bash
curl -X POST "https://llm.exosites.ch/key/generate" \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"key_alias":"exo-desktop-staging","duration":"90d","models":["mistral","nomic-embed-text"],"max_parallel_requests":2}'
```

Store the returned key in Exo as `OLLAMA_API_KEY` only — never commit it.

## Firewall

Restrict port **4000** (or **443** with TLS) to known client IPs. When your home IP changes, update the Infomaniak panel rule.
