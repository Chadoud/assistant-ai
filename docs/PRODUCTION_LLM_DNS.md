# Production LLM DNS — `llm.exosites.ch`

Staging (`llm-staging.exosites.ch`) is live. Production uses the **same VPS** until you split stacks.

## 1. Create DNS record (Infomaniak)

1. Log in to [Infomaniak Manager](https://manager.infomaniak.com) → **Domains** → `exosites.ch` → **DNS**.
2. Add an **A** record:
   - **Name:** `llm` (full name: `llm.exosites.ch`)
   - **Target:** your LLM VPS IPv4 (same A record as `llm-staging.exosites.ch` until you split stacks)
   - **TTL:** 300 (or default)

Wait 5–15 minutes, then verify:

```bash
dig +short llm.exosites.ch A @8.8.8.8
# → your LLM VPS IPv4
```

## 2. Enable TLS on the VPS

```bash
npm run ga:enable-production-llm
```

This rsyncs infra, adds `llm.exosites.ch` to Caddy, and obtains a Let's Encrypt certificate.

Verify:

```bash
curl -fsS https://llm.exosites.ch/health/liveliness
SORT_CREDENTIALS_BASE=https://llm.exosites.ch npm run verify:sort-ga
```

## 3. Cut packaged desktop to production (GA build only)

Update when moving off staging:

- `electron/resources/integration-config.json` → `EXOSITES_SORT_CREDENTIALS_URL`
- `electron/cloudAuth.js` → `PACKAGED_SORT_CREDENTIALS_URL`

Closed beta can stay on **staging** — no desktop change required until open marketing.

## 4. Optional: point cloud API at production LLM

On Infomaniak `api.exosites.ch` (only if api can reach VPS — desktops use the broker directly):

```
SORT_LLM_BASE_URL=https://llm.exosites.ch
```

Restart Node app in Manager after changing `.env`.
