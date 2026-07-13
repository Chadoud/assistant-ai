-- Migration 007 — DataSuite insight views (MariaDB 10.11+).
-- Read-only consumer: datasuite.exosites.ch. Re-run safe.

DROP VIEW IF EXISTS v_signed_in_vs_anonymous_daily;
CREATE VIEW v_signed_in_vs_anonymous_daily AS
SELECT
  DATE(created_at) AS day,
  SUM(account_id IS NOT NULL) AS signed_in_events,
  SUM(account_id IS NULL) AS anonymous_events
FROM telemetry_events
GROUP BY DATE(created_at);

DROP VIEW IF EXISTS v_event_volume_daily;
CREATE VIEW v_event_volume_daily AS
SELECT
  DATE(created_at) AS day,
  COUNT(*) AS events
FROM telemetry_events
GROUP BY DATE(created_at);

DROP VIEW IF EXISTS v_feedback_submissions_weekly;
CREATE VIEW v_feedback_submissions_weekly AS
SELECT
  DATE(DATE_SUB(created_at, INTERVAL WEEKDAY(created_at) DAY)) AS week_start,
  COUNT(*) AS submissions
FROM product_feedback
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 12 WEEK)
GROUP BY week_start;

DROP VIEW IF EXISTS v_release_starts_14d;
CREATE VIEW v_release_starts_14d AS
SELECT
  app_version,
  COUNT(*) AS starts
FROM telemetry_events
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
  AND event_name = 'app_started'
GROUP BY app_version;
