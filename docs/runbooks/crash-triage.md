# Crash triage runbook

Operational guide for turning [DataSuite Quality](https://datasuite.exosites.ch) crash signals into shipped fixes.

## When to triage

| Trigger | Action |
|---------|--------|
| Daily cron alert (`crash-alert-new-signature.js` exit 1) | Open Quality within 24h |
| Product tab **critical** priority mentions crashes | Assign owner same day |
| User report + matching crash row | Click row → breadcrumbs before asking for repro |

## Triage workflow (15 min per signature)

1. **Quality → Recent crashes** — click the row.
2. Read **breadcrumbs** — last 30 actions before crash (feature, tool, intent).
3. Read **session timeline** — assistant turns, provider errors (429), send_message events.
4. Note **signature** (`crash_signature`) — dedupe key for the bug class.
5. Set status in **Crash triage backlog**:
   - `new` → `triaged` when reproduced or diagnosed from data alone
   - `fixed` + version when fix ships
   - `wontfix` only with written rationale in notes
6. Link fix PR to signature in team notes (Linear/GitHub issue).

## Status meanings

| Status | Meaning |
|--------|---------|
| `new` | Auto-created on first signature |
| `triaged` | Owner assigned, root cause understood or repro steps documented |
| `fixed` | Fix in production — set **Fixed in** version |
| `wontfix` | Accepted risk — document why in notes |

## CLI on api.exosites.ch

```bash
cd sites/api.exosites.ch

# All recent crashes
node scripts/list-recent-crashes.js 20

# WhatsApp / messaging path
node scripts/list-recent-crashes.js 20 whatsapp

# Daily new-signature alert (cron uses exit 1)
node scripts/crash-alert-new-signature.js
```

## Common patterns

| Breadcrumb / intent | Likely area | First check |
|---------------------|-------------|-------------|
| `send_message_started` + `messaging_whatsapp` | Desktop WhatsApp automation | `backend/actions/send_message.py`, assistant chat render |
| `provider_error` + `429` before crash | LLM quota | User API key / quota toast — not always a crash bug |
| `active_feature=assistant` + React stack | Chat UI | `AssistantMessageBubble`, message content type |
| No breadcrumbs | Legacy build or opt-out | Ask user to update + enable crash reports |

## Release gate

Before shipping desktop:

1. Quality → compare crash count vs prior 7 days
2. No unresolved **critical** from Product tab
3. `bash scripts/verify-crash-enriched.sh` green after API deploy

## Retention

| Data | Retention | Cron |
|------|-----------|------|
| `telemetry_events` | 90 days | `prune-product-analytics.js` |
| `crash_reports` (incl. breadcrumbs) | 180 days | `prune-crash-reports.js` |
| `product_feedback` | 365 days | `prune-product-analytics.js` |

Install cron: `./scripts/install-product-intelligence-cron.sh`

If `crontab` is unavailable (Infomaniak Node.js), add the same commands in **Manager → Node.js → Scheduled tasks** for `api.exosites.ch`.

## Grants

If Quality inbox or Product views are empty after migration deploy, run SQL as DB admin:

`cloud-node/migrations/015_datasuite_grants_012_014.sql.example`

See also [product-intelligence.md](./product-intelligence.md).
