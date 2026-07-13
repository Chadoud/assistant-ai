-- Migration 017 — granular sort analytics views for DataSuite Product tab.
-- Depends on job_completed / sort_blocked telemetry (desktop build with G1+ instrumentation).

DROP VIEW IF EXISTS v_sort_blockers_30d;
DROP VIEW IF EXISTS v_sort_health_30d;

CREATE VIEW v_sort_health_30d AS
SELECT
  DATE(created_at) AS day,
  COUNT(*) AS jobs_completed,
  SUM(JSON_UNQUOTE(JSON_EXTRACT(event_props, '$.outcome')) = 'clean') AS clean_jobs,
  SUM(JSON_UNQUOTE(JSON_EXTRACT(event_props, '$.outcome')) = 'has_uncertain') AS uncertain_jobs,
  SUM(JSON_UNQUOTE(JSON_EXTRACT(event_props, '$.outcome')) IN ('has_failures', 'mixed')) AS failure_jobs,
  SUM(JSON_UNQUOTE(JSON_EXTRACT(event_props, '$.uncertain_rate_bucket')) IN ('11-30%', '30%+')) AS high_uncertain_jobs
FROM telemetry_events
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
  AND event_name = 'job_completed'
  AND app_version COLLATE utf8mb4_unicode_ci <> 'verify'
  AND platform COLLATE utf8mb4_unicode_ci <> 'script'
  AND instance_id COLLATE utf8mb4_unicode_ci NOT LIKE 'verify-%'
GROUP BY DATE(created_at);

CREATE VIEW v_sort_blockers_30d AS
SELECT
  JSON_UNQUOTE(JSON_EXTRACT(event_props, '$.reason')) AS reason,
  COUNT(*) AS blocks,
  COUNT(DISTINCT instance_id) AS unique_installs
FROM telemetry_events
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
  AND event_name = 'sort_blocked'
  AND app_version COLLATE utf8mb4_unicode_ci <> 'verify'
  AND platform COLLATE utf8mb4_unicode_ci <> 'script'
  AND instance_id COLLATE utf8mb4_unicode_ci NOT LIKE 'verify-%'
  AND JSON_UNQUOTE(JSON_EXTRACT(event_props, '$.reason')) IS NOT NULL
  AND JSON_UNQUOTE(JSON_EXTRACT(event_props, '$.reason')) <> ''
GROUP BY JSON_UNQUOTE(JSON_EXTRACT(event_props, '$.reason'))
ORDER BY blocks DESC;
