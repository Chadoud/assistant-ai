# Incident response runbook

**Owner:** On-call engineer (assign in team roster)  
**Last updated:** 2026-06-16

## Severity levels

| Level | Examples | Response time |
|-------|----------|---------------|
| **SEV-1** | Cloud auth down, sync relay data loss, widespread crash spike | Immediate — page on-call |
| **SEV-2** | Sort pipeline broken (Ollama), trial gate misconfigured | Same business day |
| **SEV-3** | Single integration OAuth regression, UI copy bug | Next sprint |

## First 15 minutes

1. **Confirm impact** — Sentry (renderer), `GET https://api.exosites.ch/health`, packaged app `/ready`.
2. **Gather context** — app version, platform, `X-Request-Id` from Help → Copy diagnostics.
3. **Check recent deploys** — cloud-node relay, desktop tag, mobile build.
4. **Assign incident lead** — one person coordinates; others investigate.

## Diagnostics checklist

| Signal | Where |
|--------|--------|
| Renderer crashes | Sentry project (opt-in users) |
| Cloud API | `./scripts/verify-cloud-auth-api.sh` |
| Sync auth | [sync-auth-failure.md](./sync-auth-failure.md) |
| Local backend | `curl -s http://127.0.0.1:7799/ready \| jq .` |
| Cloud metrics | `curl -s https://api.exosites.ch/metrics` — see [observability.md](./observability.md) |
| Sync runs (desktop) | `userData/sync_runs.jsonl` |
| Crash ingest | `backend/scripts/test_crash_ingest_connection.py` |

## Rollback

| Component | Action |
|-----------|--------|
| **cloud-node** | Redeploy previous release via [relay-deploy.md](./relay-deploy.md) |
| **Desktop** | Pause auto-update; republish prior `v*` tag installers |
| **Mobile** | Halt store rollout; promote previous build in TestFlight / Play Console |

## Communications template

> We are investigating [symptom] affecting [desktop / cloud / mobile].  
> Workaround: [if any].  
> Next update: [time UTC].

Post to status channel when SEV-1/2; update when mitigated or resolved.

## Post-incident

Within 48 hours:

1. Root cause (one paragraph).
2. Detection gap — why didn’t we catch it earlier?
3. Action items with owners — link to `docs/PRODUCTION_READINESS.md` task IDs when applicable.

## Sentry alerts (configure in Sentry UI)

- New issue rate > baseline × 3 in 1 hour
- Crash-free sessions drop below 95% (7-day rolling)

Document alert URLs here after setup: _[add links]_
