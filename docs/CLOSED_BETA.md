# Closed beta — staging (`llm-staging.exosites.ch`)

Invite **5–20 users** max. No public marketing until production LLM + corpus QA complete.

## Before sending invites

```bash
npm run ga:closed-beta-kickoff:fast   # or full: npm run ga:closed-beta-kickoff
npm run ga:staging-fixture-gate
npm run ga:live-sort
```

If verify scripts hit **register rate limits**, provision a dedicated login account once:

```bash
cp cloud-node/.env.verify.example cloud-node/.env.verify
# set GA_VERIFY_PASSWORD in .env.verify
npm run ga:provision-verify
```

All automated checks green + complete the 4 manual steps printed at the end.

## Invite email (template)

> Exo cloud sorting is in closed beta. Sign in with your Exo account — sorting runs on our servers; you don’t need to configure an API key. Scanned pages still use an optional **local** vision model (Settings → AI models → Photos & scans).
>
> If sort fails: check you’re signed in and on the latest build.

## What to watch (first week)

| Signal | Where |
|--------|--------|
| Daily health bundle | `npm run ga:beta-health` → `reports/beta-health/` |
| Sort credentials 401/402 | VPS broker logs: `docker logs sort-credentials-broker` |
| LiteLLM 5xx / 429 | `docker logs litellm` on VPS |
| Auth issues | `api.exosites.ch` health |
| Accuracy regressions | User reports + optional sort-plan CSV export |

## Rollback (one user)

Settings → Advanced → local sort, or delete `backend-env-overrides.json` and sign out.

## Exit criteria → open beta

- [ ] 7 days, no P0 sort/auth incidents
- [ ] Real corpus eval ±2% vs baseline (`npm run ga:corpus-compare -- baseline.csv staging.csv`)
- [ ] `llm.exosites.ch` live — see [`docs/PRODUCTION_LLM_DNS.md`](PRODUCTION_LLM_DNS.md)
