# DataSuite — Activity, retention & churn

Internal reference for **https://datasuite.exosites.ch** Activity tab and MariaDB views.

## Questions this answers

1. **Who is still using Exo?** Installs (`instance_id`) and signed-in accounts that have not objected to analytics (or sent events before objection).
2. **From when to when?** `first_seen` / `last_seen` per install and account.
3. **Who likely stopped?** Inferred silence — not confirmed uninstall.

## Definitions

| Term | Meaning |
|------|---------|
| **Install** | One desktop profile (`instance_id` in local storage) |
| **Active** | Last event within 7 days |
| **Silent** | Last event 8–30 days ago |
| **Likely stopped** | No events for 30+ days |
| **New** | First seen within 7 days |
| **Account deleted** | Client sends `account_deleted` before cloud delete |

We never claim “user uninstalled the app” unless an explicit signal exists (desktop uninstall is out of scope v1).

## Data path

```
Desktop (analytics active — default under legitimate interest; user may object) → local API → electron telemetryCloudSync → api.exosites.ch
                                                          → telemetry_events (MariaDB)
                                                          → v_device_activity / v_account_activity / v_retention_weekly
                                                          → DataSuite Activity tab
```

Cloud sync works **signed-in or anonymous** (Bearer optional). Verify script rows (`app_version=verify`, `platform=script`, `verify-*` instance ids) are excluded.

## Views (migration 009)

- `v_device_activity` — one row per install
- `v_account_activity` — one row per signed-in account (masked email in UI)
- `v_retention_weekly` — cohort week × weeks since first open

Apply on api.exosites.ch:

```bash
node scripts/apply-migration-009.js
```

Grant SELECT on new views to the DataSuite DB user (see `006_datasuite_grants.sql.example`).

## Lifecycle telemetry events

| Event | When |
|-------|------|
| `account_signed_in` | After successful login / social sign-in |
| `account_signed_out` | Sign out / switch account |
| `account_deleted` | Before cloud account delete |
| `telemetry_opt_in` / `telemetry_opt_out` | User re-enabled analytics or objected (Settings → Privacy) |
| `app_heartbeat` | Once per 24h while app open (when analytics not objected) |

## Ops

- Weekly digest: `node scripts/datasuite-weekly-digest.js`
- Verify ingest (health only): `VERIFY_ANALYTICS_SKIP_POST=1 ./scripts/verify-product-analytics.sh`
- DB grants test: `npm run test:datasuite-db`

## Limitations

- Diagnostics are **on by default** (legitimate interest); users may **object** in Settings → Privacy — Activity tab reflects users who still send events.
- Requires a **desktop release** with lifecycle events + collection fixes for full signal.
- Retention percentages hidden when cohort size &lt; 5 installs.
