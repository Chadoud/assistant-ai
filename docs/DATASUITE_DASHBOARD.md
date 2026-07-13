# DataSuite — internal product dashboard

Password-protected dashboard at **https://datasuite.exosites.ch** reading from the production MariaDB app database (name in `cloud-node/.env`, never commit).

**Deploy & hosting:** [INFOMANIAK_HOSTING.md](./INFOMANIAK_HOSTING.md) (Web FTP vs Node SSH — do not mix).

## Quick start

```bash
cp datasuite/.env.deploy.example datasuite/.env.deploy   # FTP credentials
npm run datasuite:generate-env                           # → datasuite/.env.server
UPLOAD_ENV=1 VERIFY_AFTER_DEPLOY=1 npm run deploy:datasuite
npm run verify:datasuite
```

Apply DB views (includes migration 007 insight views):

```bash
npm run deploy:cloud-api   # runs migrations 001–007 on api.exosites.ch
```

## UI features

- **Global period:** 7d / 30d / 90d selector (all panels)
- **Overview:** metric cards with prior-period comparison, sparklines
- **Funnel:** waterfall chart, conversion rates, onboarding steps
- **Quality:** crash trend, release health (crashes per 100 starts)
- **Feedback:** category badges, expandable messages, weekly volume
- **Trends:** DAU line chart, signed-in vs anonymous stacked chart
- **Refresh** button + last updated timestamp

## API

All authenticated endpoints accept `?days=7|30|90` and return `period_days`, `updated_at`, and `headline`.

| Path | Auth | Data |
|------|------|------|
| `/api/health.php` | public | `{ ok, db }` |
| `/api/overview.php` | session | summary + comparison + sparklines |
| `/api/funnel.php` | session | waterfall + onboarding |
| `/api/quality.php` | session | crashes, release rates |
| `/api/feedback.php` | session | inbox + weekly |
| `/api/trends.php` | session | DAU + sign-in mix |

## Weekly digest (optional cron on api host)

```bash
node scripts/datasuite-weekly-digest.js
```

Pipe stdout to e-mail or Slack. No secrets in output.

## Database

- Views: migrations `005`, `006`, `007` via `npm run deploy:cloud-api`
- Read-only MariaDB user: set in `datasuite/.env.db` — grants template in `cloud-node/migrations/006_datasuite_grants.sql.example`
- Test DB access: `npm run test:datasuite-db`

Desktop crash ingest stays on `api.exosites.ch` via `backend/.env` `EXOSITES_CRASH_INGEST_*`.

See [PRODUCT_ANALYTICS_DASHBOARD.md](./PRODUCT_ANALYTICS_DASHBOARD.md) for ingest and retention.
