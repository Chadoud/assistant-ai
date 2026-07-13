# Product intelligence runbook

Internal guide for operating [DataSuite](https://datasuite.exosites.ch) as a **company decision system**.

## Weekly rhythm (30 minutes)

| Step | Action |
|------|--------|
| 1 | Open **Product** tab — read headline and top 3 priorities |
| 2 | Assign owners: Reliability, Assistant, Sort, Integrations |
| 3 | **Quality** — triage new crash signatures; click rows for breadcrumbs |
| 4 | **Activity** — click installs with crashes or churn risk |
| 5 | **Feedback** — tag themes (bug / ux / idea) |
| 6 | Ship fix → mark **fixed** in Quality triage (set version when status is fixed) |

## Cron on api.exosites.ch

Infomaniak Node.js hosts often have no shell `crontab`. Use **Manager → Node.js → api.exosites.ch → Scheduled tasks**, or run:

```bash
./scripts/install-product-intelligence-cron.sh
```

| Schedule | Command |
|----------|---------|
| Mon 08:00 | `node scripts/datasuite-weekly-digest.js` |
| Daily 07:00 | `node scripts/crash-alert-new-signature.js` (notify when exit 1) |
| Sun 03:00 | `node scripts/prune-product-analytics.js 90 365` |
| Sun 03:30 | `node scripts/prune-crash-reports.js 180` |

## Tab guide

| Tab | Company question |
|-----|------------------|
| **Product** | What should we fix and improve this week? |
| **Overview** | Are we growing? Event volume? |
| **Activity** | Who uses Exo? Who stopped? Per-install 360 |
| **Funnel** | Where do users drop in sort/onboarding? |
| **Quality** | What broke? Crash inbox + triage backlog |
| **Feedback** | What do users say in their own words? |
| **Trends** | Device activity over time |

## Per-install 360 (Activity → click install)

Shows: daily events, event mix, **feature usage**, **sessions**, **crashes** for that install.

## Crash triage statuses

| Status | Meaning |
|--------|---------|
| `new` | Auto-created on first signature |
| `triaged` | Reproduced, owner assigned |
| `fixed` | Fix shipped — set `fixed_in_version` |
| `wontfix` | Accepted risk |

Update in **Quality → Crash triage backlog** (inline status + version), or via phpMyAdmin:

```sql
UPDATE crash_triage SET status = 'fixed', fixed_in_version = '1.2.0'
WHERE crash_signature = '...';
```

## Release gate (desktop build)

Before shipping a desktop release:

1. Compare crash count vs prior 7 days in **Product**
2. Assistant success rate must not drop >10% absolute
3. No **critical** priority unresolved from prior week
4. Run smoke: `bash scripts/verify-crash-enriched.sh`

## Data requirements

Users must opt in to **analytics** and **crash reports** in Settings. Feature time and assistant health require the latest desktop build with telemetry events (`feature_entered`, `assistant_turn_*`, etc.).

## Migrations

| Migration | Adds |
|-----------|------|
| 012 | Enriched crashes + session_id on events |
| 013 | Product intelligence views |
| 014 | app_sessions, crash_triage, install/account health |

Apply via `npm run deploy:cloud-api` then run SQL in phpMyAdmin:

`cloud-node/migrations/015_datasuite_grants_012_014.sql.example`

Or: `node cloud-node/scripts/apply-datasuite-grants.js` (requires DB admin; usually fails on shared hosting — use phpMyAdmin).
