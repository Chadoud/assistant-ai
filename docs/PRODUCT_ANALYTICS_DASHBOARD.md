# Product analytics dashboard (Infomaniak MariaDB)

Central, dashboard-ready product data lives in **`YOUR_IK_ID_exo_app`** (single database). Use phpMyAdmin on Infomaniak or connect Metabase/Grafana to the same host.

## Data model (concise)

| Table | Purpose | Grain |
|-------|---------|-------|
| `telemetry_events` | Opt-in usage events | **One row per event** |
| `product_feedback` | In-app feedback (Settings → Privacy) | One row per submission |
| `crash_reports` | Opt-in crashes (`X-Crash-Token`) | One row per crash |

**Privacy:** No file paths, email, or prompts in telemetry. `account_id` is set only when the desktop is signed in (Bearer token). Anonymous batches still work (instance_id only).

**Legacy DB:** `YOUR_IK_ID_crash_reports` is obsolete. New crashes go to `crash_reports` inside `exo_app`. Migration `001_consolidate_crash_reports.sql` copied all rows; production counts were verified equal — **safe to drop** the old database in the Infomaniak panel.

## Dashboard views (pre-built)

Run `node scripts/apply-migration-005.js` (included in deploy). Views:

| View | Use for |
|------|---------|
| `v_daily_event_counts` | Event volume by day + signed-in users |
| `v_daily_active_devices` | DAU (devices) trend |
| `v_feedback_inbox` | Latest feedback with preview |
| `v_crash_daily` | Crash trend by version/source |
| `v_sort_funnel_7d` | 7-day funnel: start → drop → job → CTA → feedback |

## Example queries (phpMyAdmin → SQL)

**Activation funnel (last 7 days)**

```sql
SELECT * FROM v_sort_funnel_7d ORDER BY events_7d DESC;
```

**Where users drop off (conversion)**

```sql
SELECT
  SUM(CASE WHEN event_name = 'app_started' THEN 1 ELSE 0 END) AS starts,
  SUM(CASE WHEN event_name = 'first_drop' THEN 1 ELSE 0 END) AS first_drops,
  SUM(CASE WHEN event_name = 'job_started' THEN 1 ELSE 0 END) AS jobs
FROM telemetry_events
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY);
```

**Top UX issues (feedback)**

```sql
SELECT category, COUNT(*) AS n
FROM product_feedback
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY category
ORDER BY n DESC;
```

**Crashes vs releases**

```sql
SELECT * FROM v_crash_daily
WHERE day >= DATE_SUB(CURDATE(), INTERVAL 14 DAY)
ORDER BY day DESC, crashes DESC;
```

**Signed-in vs anonymous usage**

```sql
SELECT
  DATE(created_at) AS day,
  SUM(account_id IS NOT NULL) AS signed_in_events,
  SUM(account_id IS NULL) AS anonymous_events
FROM telemetry_events
GROUP BY DATE(created_at)
ORDER BY day DESC
LIMIT 30;
```

## Ingest endpoints (api.exosites.ch)

| Method | Path | Auth |
|--------|------|------|
| POST | `/v1/telemetry/events` | Optional Bearer (links `account_id`) |
| POST | `/v1/telemetry/feedback` | Optional Bearer |
| POST | `/v1/crash-reports` | `X-Crash-Token` |
| GET | `/v1/public/client-config` | Public |

Desktop flow: events/feedback → local SQLite (offline) **and** cloud mirror when `EXOSITES_CLOUD_URL` is set (signed-in or anonymous).

## Activity & retention views (migration 009)

| View | Use for |
|------|---------|
| `v_device_activity` | Per-install first/last seen, status (active / silent / likely stopped) |
| `v_account_activity` | Signed-in account rollups |
| `v_retention_weekly` | Cohort retention by week of first open |

Apply: `node scripts/apply-migration-009.js`. Dashboard: **Activity** tab at [datasuite.exosites.ch](https://datasuite.exosites.ch). See [DATASUITE_RETENTION.md](./DATASUITE_RETENTION.md).

**Lifecycle events:** `account_signed_in`, `account_signed_out`, `account_deleted`, `telemetry_opt_in`, `telemetry_opt_out`, `app_heartbeat`.

**Account delete:** client sends `account_deleted` before `DELETE /v1/me`; server purges `telemetry_events` and `product_feedback` for that `account_id` and records `accounts_deleted_at` (hash only).

## Retention (cron on Infomaniak)

```bash
# Weekly — telemetry 90d, feedback 365d
node scripts/prune-product-analytics.js 90 365

# Crashes — enriched breadcrumbs retained 180d
node scripts/prune-crash-reports.js 180

# Cron (api host): ./scripts/install-product-intelligence-cron.sh
```

## Deploy & verify

```bash
npm run deploy:cloud-api          # applies migrations through 010
bash scripts/verify-product-analytics.sh
# Health-only (no verify rows): VERIFY_ANALYTICS_SKIP_POST=1 bash scripts/verify-product-analytics.sh
node scripts/datasuite-pipeline-health.js   # exit 1 on alerts — cron/Slack
```

Health should report `"product_analytics": true`.

## Continuous improvement loop

1. **Funnel** (`v_sort_funnel_7d`) — fix the step with the biggest drop.
2. **Feedback inbox** — tag themes weekly (bug / ux / idea).
3. **Crashes** — group by `error_message` prefix; tie to `app_version`.
4. **Locale** — filter `locale` on events/feedback for i18n gaps.
5. **Release check** — compare `app_version` before/after each desktop build.

## Internal dashboard (next step)

Shipped at **`datasuite.exosites.ch`** — see [DATASUITE_DASHBOARD.md](./DATASUITE_DASHBOARD.md) and [INFOMANIAK_HOSTING.md](./INFOMANIAK_HOSTING.md).

**Product intelligence (company operating rhythm):** [runbooks/product-intelligence.md](./runbooks/product-intelligence.md) — weekly priorities, install 360, crash triage, release gate.

**Crash triage:** [runbooks/crash-triage.md](./runbooks/crash-triage.md) · **Event registry:** [analytics/event-registry.md](./analytics/event-registry.md)

**DataSuite tabs:**

| Tab | Purpose |
|-----|---------|
| **Product** | Executive brief — ranked fixes, feature time, assistant/messaging health |
| Overview | KPI cards and trends |
| Activity | Per-install 360 (sessions, crashes, features) |
| Funnel | Sort/onboarding conversion |
| Quality | Crash inbox, triage backlog, detail modal |
| Feedback | User submissions |
| Trends | Device activity |

**Hosting topology (Infomaniak):**

| Subdomain | Stack | Role |
|-----------|-------|------|
| `exosites.ch` | PHP | Marketing only |
| `datasuite.exosites.ch` | **PHP 8.4** | Read-only internal dashboard (FTP: `sites/datasuite.exosites.ch`) |
| `api.exosites.ch` | **Node.js** | Auth, ingest, crashes, telemetry writes |

## Legacy cleanup checklist

| Asset | Action |
|-------|--------|
| MariaDB `YOUR_IK_ID_crash_reports` | **Drop** — counts match `exo_app.crash_reports` (verified) |
| FTP `sites/crash-ingest` | Backup → delete (superseded by `api.exosites.ch`) |
| FTP `sites/crash.exosites.ch` | Backup → delete |
| `backend/.env` `EXOSITES_CRASH_INGEST_*` | **Keep** — desktop crash forward still uses these |
