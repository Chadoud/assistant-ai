-- Migration 009 — DataSuite activity & retention views (MariaDB 10.11+).
-- Read-only consumer: datasuite.exosites.ch. Re-run safe.

DROP VIEW IF EXISTS v_retention_weekly;
DROP VIEW IF EXISTS v_account_activity;
DROP VIEW IF EXISTS v_device_activity;

CREATE VIEW v_device_activity AS
SELECT
  te.instance_id,
  MIN(te.created_at) AS first_seen,
  MAX(te.created_at) AS last_seen,
  COUNT(DISTINCT DATE(te.created_at)) AS active_days,
  COUNT(*) AS event_count,
  SUBSTRING_INDEX(GROUP_CONCAT(te.app_version ORDER BY te.created_at DESC SEPARATOR '\t'), '\t', 1) AS last_app_version,
  SUBSTRING_INDEX(GROUP_CONCAT(te.platform ORDER BY te.created_at DESC SEPARATOR '\t'), '\t', 1) AS last_platform,
  MAX(te.account_id) AS last_account_id,
  CASE
    WHEN MAX(te.created_at) >= NOW() - INTERVAL 7 DAY THEN 'active'
    WHEN MAX(te.created_at) >= NOW() - INTERVAL 30 DAY THEN 'silent'
    ELSE 'likely_churned'
  END AS status,
  CASE
    WHEN MIN(te.created_at) >= NOW() - INTERVAL 7 DAY THEN 1
    ELSE 0
  END AS is_new
FROM telemetry_events te
WHERE te.app_version COLLATE utf8mb4_unicode_ci <> 'verify'
  AND te.platform COLLATE utf8mb4_unicode_ci <> 'script'
  AND te.instance_id COLLATE utf8mb4_unicode_ci NOT LIKE 'verify-%'
GROUP BY te.instance_id;

CREATE VIEW v_account_activity AS
SELECT
  te.account_id,
  a.email,
  MIN(te.created_at) AS first_seen,
  MAX(te.created_at) AS last_seen,
  COUNT(DISTINCT te.instance_id) AS device_count,
  COUNT(*) AS event_count,
  CASE
    WHEN MAX(te.created_at) >= NOW() - INTERVAL 7 DAY THEN 'active'
    WHEN MAX(te.created_at) >= NOW() - INTERVAL 30 DAY THEN 'silent'
    ELSE 'likely_churned'
  END AS status
FROM telemetry_events te
INNER JOIN accounts a
  ON a.id COLLATE utf8mb4_unicode_ci = te.account_id COLLATE utf8mb4_unicode_ci
WHERE te.account_id IS NOT NULL
  AND te.app_version COLLATE utf8mb4_unicode_ci <> 'verify'
  AND te.platform COLLATE utf8mb4_unicode_ci <> 'script'
  AND te.instance_id COLLATE utf8mb4_unicode_ci NOT LIKE 'verify-%'
  AND a.email COLLATE utf8mb4_unicode_ci <> 'ga-verify@exosites.ch'
  AND a.email COLLATE utf8mb4_unicode_ci NOT LIKE '%@example.com'
GROUP BY te.account_id, a.email;

CREATE VIEW v_retention_weekly AS
SELECT
  cohort_week,
  weeks_since,
  COUNT(DISTINCT instance_id) AS retained_installs
FROM (
  SELECT
    d.instance_id,
    DATE(DATE_SUB(d.first_seen, INTERVAL WEEKDAY(d.first_seen) DAY)) AS cohort_week,
    FLOOR(
      DATEDIFF(
        DATE(e.created_at),
        DATE(DATE_SUB(d.first_seen, INTERVAL WEEKDAY(d.first_seen) DAY))
      ) / 7
    ) AS weeks_since
  FROM (
    SELECT instance_id, MIN(created_at) AS first_seen
    FROM telemetry_events
    WHERE app_version COLLATE utf8mb4_unicode_ci <> 'verify'
      AND platform COLLATE utf8mb4_unicode_ci <> 'script'
      AND instance_id COLLATE utf8mb4_unicode_ci NOT LIKE 'verify-%'
    GROUP BY instance_id
  ) d
  INNER JOIN telemetry_events e
    ON e.instance_id COLLATE utf8mb4_unicode_ci = d.instance_id COLLATE utf8mb4_unicode_ci
  WHERE e.app_version COLLATE utf8mb4_unicode_ci <> 'verify'
    AND e.platform COLLATE utf8mb4_unicode_ci <> 'script'
    AND e.instance_id COLLATE utf8mb4_unicode_ci NOT LIKE 'verify-%'
    AND e.created_at >= d.first_seen
) cohort_rows
WHERE weeks_since >= 0
  AND weeks_since <= 12
GROUP BY cohort_week, weeks_since;
