-- Migration 006 — DataSuite dashboard views (MariaDB 10.11+).
-- Read-only consumer: datasuite.exosites.ch (PHP). Write path unchanged: api.exosites.ch.
-- Re-run safe: DROP VIEW IF EXISTS + CREATE VIEW.

DROP VIEW IF EXISTS v_exec_summary_30d;
CREATE VIEW v_exec_summary_30d AS
SELECT
  (SELECT COUNT(DISTINCT instance_id)
   FROM telemetry_events
   WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS active_devices_30d,
  (SELECT COUNT(DISTINCT account_id)
   FROM telemetry_events
   WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
     AND account_id IS NOT NULL) AS signed_in_users_30d,
  (SELECT COUNT(*)
   FROM telemetry_events
   WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS total_events_30d,
  (SELECT COUNT(*)
   FROM product_feedback
   WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS feedback_30d,
  (SELECT COUNT(*)
   FROM crash_reports
   WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS crashes_30d,
  (SELECT COUNT(*)
   FROM accounts
   WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS new_accounts_30d;

DROP VIEW IF EXISTS v_funnel_conversion_7d;
CREATE VIEW v_funnel_conversion_7d AS
SELECT
  SUM(CASE WHEN event_name = 'app_started' THEN 1 ELSE 0 END) AS starts,
  SUM(CASE WHEN event_name = 'first_drop' THEN 1 ELSE 0 END) AS first_drops,
  SUM(CASE WHEN event_name = 'job_started' THEN 1 ELSE 0 END) AS jobs_started,
  SUM(CASE WHEN event_name = 'post_run_cta_clicked' THEN 1 ELSE 0 END) AS post_run_cta,
  SUM(CASE WHEN event_name = 'feedback_submitted' THEN 1 ELSE 0 END) AS feedback_events
FROM telemetry_events
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
  AND event_name IN (
    'app_started',
    'first_drop',
    'job_started',
    'post_run_cta_clicked',
    'feedback_submitted'
  );

DROP VIEW IF EXISTS v_top_crash_signatures_30d;
CREATE VIEW v_top_crash_signatures_30d AS
SELECT
  LEFT(error_message, 120) AS signature,
  app_version,
  source,
  COUNT(*) AS crashes,
  MAX(created_at) AS last_seen
FROM crash_reports
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY LEFT(error_message, 120), app_version, source
ORDER BY crashes DESC
LIMIT 50;

DROP VIEW IF EXISTS v_release_health_14d;
CREATE VIEW v_release_health_14d AS
SELECT
  app_version,
  COUNT(*) AS crashes,
  COUNT(DISTINCT LEFT(error_message, 120)) AS unique_signatures,
  MIN(created_at) AS first_crash,
  MAX(created_at) AS last_crash
FROM crash_reports
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
GROUP BY app_version
ORDER BY crashes DESC;

DROP VIEW IF EXISTS v_feedback_weekly_12w;
CREATE VIEW v_feedback_weekly_12w AS
SELECT
  YEARWEEK(created_at, 3) AS year_week,
  DATE(DATE_SUB(created_at, INTERVAL WEEKDAY(created_at) DAY)) AS week_start,
  category,
  COUNT(*) AS submissions
FROM product_feedback
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 12 WEEK)
GROUP BY YEARWEEK(created_at, 3), week_start, category
ORDER BY week_start DESC, submissions DESC;
