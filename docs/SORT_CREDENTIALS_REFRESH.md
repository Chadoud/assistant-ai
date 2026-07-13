# Sort credentials refresh (implemented)

When VPS broker config changes (`SORT_SERVICE_MODE`, worker URL, queue policy), desktops pick up changes without logout.

## Behavior

| Trigger | Action |
|---------|--------|
| Settings → **Refresh sorting connection** | Force full broker sync (`force: true`) |
| App launch / entitlement refresh | Sync if token expired, config revision unknown, or revision mismatch |
| Valid token + matching revision | Skip broker POST (`still_valid`) |

## Broker

- `GET /v1/sort/credentials/config` — auth via cloud Bearer; no LiteLLM key mint
- `credentials_config_revision` on POST response (12-char hash of public config)
- Optional `SORT_CREDENTIALS_CONFIG_REVISION_SALT` in `.env` for emergency invalidation

## Desktop

- `sort_credentials_meta.json` stores `credentials_config_revision`, `sort_service_mode`
- Config probe rate-limited to 15 min unless force refresh
- Logout clears worker env keys

## Ops

After changing broker env:

```bash
cd ~/exo-llm
docker compose ... up -d --build sort-credentials-broker
```

Users: quit/reopen Exo, or Settings → Refresh sorting connection.
