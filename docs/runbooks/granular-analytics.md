# Granular product analytics runbook

How to ship, verify, and read **sort quality**, **blockers**, **review loop**, **setup milestones**, and **assistant intent** in DataSuite.

See also: [product-intelligence.md](./product-intelligence.md) · [event-registry.md](../analytics/event-registry.md)

## Deploy order (mandatory)

1. **Schema sync** — any new event/prop touches:
   - `frontend/src/telemetry/schema.ts`
   - `backend/telemetry/schemas.py`
   - `cloud-node/lib/telemetryValidate.js`
   - `docs/analytics/event-registry.md`
2. **SQL views** — apply migration on api host:
   ```bash
   npm run deploy:cloud-api
   ```
3. **Restart** Infomaniak Manager → Node.js → **api.exosites.ch** → Restart
4. **Verify ingest**:
   ```bash
   bash scripts/verify-granular-analytics.sh
   ```
5. **DataSuite**:
   ```bash
   npm run deploy:datasuite
   VERIFY_AFTER_DEPLOY=1 npm run deploy:datasuite   # optional smoke
   ```
6. **Desktop release** — telemetry is useless until users run the new build:
   ```bash
   ./scripts/bump-version.sh <semver>
   ./scripts/release-desktop.sh
   npm run build:mac
   git tag v<semver> && git push origin v<semver>
   ```

## Verify scripts

| Script | What it checks |
|--------|----------------|
| `scripts/verify-granular-analytics.sh` | POST batch: `job_completed`, `sort_blocked`, `job_cancelled`, `review_opened`, `setup_milestone`, `assistant_turn_started` |
| `scripts/verify-product-analytics.sh` | Base product telemetry ingest |
| `scripts/verify-crash-enriched.sh` | Crash breadcrumbs + `intent_bucket` |

## SQL views (migrations 017–018)

| View | Product question |
|------|------------------|
| `v_sort_health_30d` | Clean vs messy sorts per day |
| `v_sort_blockers_30d` | Why sorts never started (`sort_blocked` by reason) |
| `v_review_funnel_30d` | Review opened → bulk applied → dismissed |
| `v_setup_milestones_30d` | First-time setup depth per milestone |
| `v_assistant_intent_30d` | Assistant turns by `intent_bucket` |

Filter: verify/script rows excluded (`app_version <> 'verify'`, `platform <> 'script'`).

## DataSuite tabs

### Product

- **Sort quality** — `%` clean vs messy (uncertain + failures). Empty until desktop ships enriched `job_completed`.
- **Why sorts never started** — top `sort_blocked` reasons. Fix onboarding when `no_output_folder` dominates.
- **Review cleanup loop** — apply rate below 40% → review UX friction (see ProductBrief priorities).
- **Setup milestones** — depth table; cross-check Funnel waterfall.
- **What users ask the assistant** — intent chart; not prompts, rule-based buckets only.

### Funnel

- **Sort funnel** — classic waterfall through job complete/cancel/fail.
- **Setup depth** — milestone waterfall: welcome → output folder → models → account → first drop.

## Privacy review checklist

Before adding props:

- [ ] No paths, filenames, folder names, prompts, or raw counts >100
- [ ] Buckets/enums only (`file_count_bucket`, `reason`, `milestone`, `intent_bucket`)
- [ ] Event documented in `docs/analytics/event-registry.md`
- [ ] Tripwire files updated (TS + Python + Node + tests)

## Post-release (48h)

```sql
-- New event names appearing from real installs (not verify-*)
SELECT event_name, COUNT(*) AS n
FROM telemetry_events
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 48 HOUR)
  AND app_version <> 'verify'
  AND instance_id NOT LIKE 'verify-%'
  AND event_name IN (
    'job_completed', 'sort_blocked', 'review_opened',
    'setup_milestone', 'assistant_turn_started'
  )
GROUP BY event_name;

-- Sort quality signal
SELECT * FROM v_sort_health_30d ORDER BY day DESC LIMIT 7;
```

**Done when:** ≥3 installs on the new version emit `job_completed` with `outcome`, and Product tab sort quality cards populate.
