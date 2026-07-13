-- Dashboard views for phpMyAdmin / Metabase / Grafana (MariaDB 10.11+).
-- Re-run safe: drops and recreates views.

DROP VIEW IF EXISTS v_daily_event_counts;
CREATE VIEW v_daily_event_counts AS
SELECT
  DATE(created_at) AS day,
  event_name,
  COUNT(*) AS events,
  COUNT(DISTINCT account_id) AS signed_in_users,
  COUNT(DISTINCT instance_id) AS devices
FROM telemetry_events
GROUP BY DATE(created_at), event_name;

DROP VIEW IF EXISTS v_daily_active_devices;
CREATE VIEW v_daily_active_devices AS
SELECT
  DATE(created_at) AS day,
  COUNT(DISTINCT instance_id) AS devices,
  COUNT(DISTINCT account_id) AS signed_in_users
FROM telemetry_events
GROUP BY DATE(created_at);

DROP VIEW IF EXISTS v_feedback_inbox;
CREATE VIEW v_feedback_inbox AS
SELECT
  id,
  created_at,
  category,
  locale,
  app_version,
  account_id,
  LEFT(message, 240) AS message_preview,
  message
FROM product_feedback
ORDER BY created_at DESC;

DROP VIEW IF EXISTS v_crash_daily;
CREATE VIEW v_crash_daily AS
SELECT
  DATE(created_at) AS day,
  source,
  app_version,
  COUNT(*) AS crashes,
  COUNT(DISTINCT LEFT(error_message, 120)) AS unique_signatures
FROM crash_reports
GROUP BY DATE(created_at), source, app_version;

DROP VIEW IF EXISTS v_sort_funnel_7d;
CREATE VIEW v_sort_funnel_7d AS
SELECT
  event_name,
  COUNT(*) AS events_7d
FROM telemetry_events
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
  AND event_name IN ('app_started', 'first_drop', 'job_started', 'post_run_cta_clicked', 'feedback_submitted')
GROUP BY event_name;
