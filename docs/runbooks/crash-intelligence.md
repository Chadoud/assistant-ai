# Crash intelligence runbook

Operational guide for Exo crash ingest, DataSuite Quality tab, and triage.

## Sources of truth

| Channel | Use |
|---------|-----|
| **MariaDB `crash_reports`** | Product analytics, release health, DataSuite inbox |
| **Sentry** (`VITE_SENTRY_DSN`) | Dev stack traces, engineering debug — parallel to ingest |
| **Local logs** | `renderer-diagnostics.log`, Electron main logs — not in DB until wired (see remediation plan P1) |

## Test rows (excluded from dashboards)

Filtered by `CrashFilter` (PHP), `crashFilter.js` (Node CLI), and migration `022` views:

- `app_version`: `verify`, `0.0.0-test`
- `source`: `script`, `selftest`, `*_archived_test`
- `platform`: `script`, `crash-ingest-selftest`, `test`
- `instance_id` prefix: `verify-`
- `error_message` contains: pytest, connectivity self-test, Automated verify, `[archived_test]`

## Ops commands

```bash
# Apply filtered crash views (prod DB)
cd cloud-node && node scripts/apply-migration-022.js

# List product crashes (CLI)
node scripts/list-recent-crashes.js 20

# Archive historical test rows (dry-run first)
node scripts/archive-test-crash-rows.js
node scripts/archive-test-crash-rows.js --apply

# Verify filter sync across PHP/JS/SQL
bash scripts/check-crash-filter-sync.sh

# Ingest smoke (verify markers — excluded from KPIs)
bash scripts/verify-crash-ingest.sh
bash scripts/verify-crash-enriched.sh
```

## Preventing pytest → prod leaks

- Backend tests set `EXOSITES_CRASH_INGEST_DISABLED=1` in `conftest.py`
- `forward_guard.py` blocks forward under `PYTEST_CURRENT_TEST` and test payloads
- Never point dev `.env` ingest URL at prod during pytest

## Triage workflow

1. DataSuite → **Quality** → crash inbox (filtered)
2. Open row → session timeline (requires `session_id` on crash — P1 enrichment)
3. Update triage status via API or future UI (`crash_triage` table)

## Related plans

- `.cursor/plans/crash_intelligence_remediation.plan.md` — active remediation
- `.cursor/plans/crash_intelligence_analytics.plan.md` — original schema/UI work
