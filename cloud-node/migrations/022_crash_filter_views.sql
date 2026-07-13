-- Migration 022 — filter verify/pytest/selftest rows from crash analytics views.
-- Predicate must stay in sync with datasuite/lib/CrashFilter.php and cloud-node/lib/crashFilter.js.

DROP VIEW IF EXISTS v_crash_daily;
CREATE VIEW v_crash_daily AS
SELECT
  DATE(created_at) AS day,
  source,
  app_version,
  COUNT(*) AS crashes,
  COUNT(DISTINCT LEFT(error_message, 120)) AS unique_signatures
FROM crash_reports
WHERE app_version COLLATE utf8mb4_unicode_ci NOT IN ('verify', '0.0.0-test')
  AND platform COLLATE utf8mb4_unicode_ci NOT IN ('script', 'crash-ingest-selftest', 'test')
  AND source COLLATE utf8mb4_unicode_ci NOT IN ('script', 'selftest')
  AND (instance_id IS NULL OR instance_id COLLATE utf8mb4_unicode_ci NOT LIKE 'verify-%')
  AND error_message COLLATE utf8mb4_unicode_ci NOT LIKE '%Test error for pytest%'
  AND error_message COLLATE utf8mb4_unicode_ci NOT LIKE '%connectivity self-test%'
  AND error_message COLLATE utf8mb4_unicode_ci NOT LIKE '%Automated verify%'
  AND error_message COLLATE utf8mb4_unicode_ci NOT LIKE '%Enriched verify ping%'
  AND error_message COLLATE utf8mb4_unicode_ci NOT LIKE '[archived_test]%'
GROUP BY DATE(created_at), source, app_version;

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
   WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
     AND app_version COLLATE utf8mb4_unicode_ci NOT IN ('verify', '0.0.0-test')
     AND platform COLLATE utf8mb4_unicode_ci NOT IN ('script', 'crash-ingest-selftest', 'test')
     AND source COLLATE utf8mb4_unicode_ci NOT IN ('script', 'selftest')
     AND (instance_id IS NULL OR instance_id COLLATE utf8mb4_unicode_ci NOT LIKE 'verify-%')
     AND error_message COLLATE utf8mb4_unicode_ci NOT LIKE '%Test error for pytest%'
     AND error_message COLLATE utf8mb4_unicode_ci NOT LIKE '%connectivity self-test%'
     AND error_message COLLATE utf8mb4_unicode_ci NOT LIKE '%Automated verify%'
     AND error_message COLLATE utf8mb4_unicode_ci NOT LIKE '%Enriched verify ping%'
     AND error_message COLLATE utf8mb4_unicode_ci NOT LIKE '[archived_test]%') AS crashes_30d,
  (SELECT COUNT(*)
   FROM accounts
   WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS new_accounts_30d;

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
  AND app_version COLLATE utf8mb4_unicode_ci NOT IN ('verify', '0.0.0-test')
  AND platform COLLATE utf8mb4_unicode_ci NOT IN ('script', 'crash-ingest-selftest', 'test')
  AND source COLLATE utf8mb4_unicode_ci NOT IN ('script', 'selftest')
  AND (instance_id IS NULL OR instance_id COLLATE utf8mb4_unicode_ci NOT LIKE 'verify-%')
  AND error_message COLLATE utf8mb4_unicode_ci NOT LIKE '%Test error for pytest%'
  AND error_message COLLATE utf8mb4_unicode_ci NOT LIKE '%connectivity self-test%'
  AND error_message COLLATE utf8mb4_unicode_ci NOT LIKE '%Automated verify%'
  AND error_message COLLATE utf8mb4_unicode_ci NOT LIKE '%Enriched verify ping%'
  AND error_message COLLATE utf8mb4_unicode_ci NOT LIKE '[archived_test]%'
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
  AND app_version COLLATE utf8mb4_unicode_ci NOT IN ('verify', '0.0.0-test')
  AND platform COLLATE utf8mb4_unicode_ci NOT IN ('script', 'crash-ingest-selftest', 'test')
  AND source COLLATE utf8mb4_unicode_ci NOT IN ('script', 'selftest')
  AND (instance_id IS NULL OR instance_id COLLATE utf8mb4_unicode_ci NOT LIKE 'verify-%')
  AND error_message COLLATE utf8mb4_unicode_ci NOT LIKE '%Test error for pytest%'
  AND error_message COLLATE utf8mb4_unicode_ci NOT LIKE '%connectivity self-test%'
  AND error_message COLLATE utf8mb4_unicode_ci NOT LIKE '%Automated verify%'
  AND error_message COLLATE utf8mb4_unicode_ci NOT LIKE '%Enriched verify ping%'
  AND error_message COLLATE utf8mb4_unicode_ci NOT LIKE '[archived_test]%'
GROUP BY app_version
ORDER BY crashes DESC;

DROP VIEW IF EXISTS v_crash_inbox_30d;
CREATE VIEW v_crash_inbox_30d AS
SELECT
  c.id,
  c.created_at,
  c.app_version,
  c.platform,
  c.source,
  c.source_detail,
  c.active_feature,
  c.active_tab,
  c.intent_bucket,
  c.tool_name,
  c.session_id,
  c.instance_id,
  c.account_id,
  c.crash_signature,
  LEFT(c.error_message, 120) AS signature_preview,
  c.last_events_json IS NOT NULL AS has_breadcrumbs
FROM crash_reports c
WHERE c.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
  AND c.app_version COLLATE utf8mb4_unicode_ci NOT IN ('verify', '0.0.0-test')
  AND c.platform COLLATE utf8mb4_unicode_ci NOT IN ('script', 'crash-ingest-selftest', 'test')
  AND c.source COLLATE utf8mb4_unicode_ci NOT IN ('script', 'selftest')
  AND (c.instance_id IS NULL OR c.instance_id COLLATE utf8mb4_unicode_ci NOT LIKE 'verify-%')
  AND c.error_message COLLATE utf8mb4_unicode_ci NOT LIKE '%Test error for pytest%'
  AND c.error_message COLLATE utf8mb4_unicode_ci NOT LIKE '%connectivity self-test%'
  AND c.error_message COLLATE utf8mb4_unicode_ci NOT LIKE '%Automated verify%'
  AND c.error_message COLLATE utf8mb4_unicode_ci NOT LIKE '%Enriched verify ping%'
  AND c.error_message COLLATE utf8mb4_unicode_ci NOT LIKE '[archived_test]%'
ORDER BY c.created_at DESC;

DROP VIEW IF EXISTS v_crash_by_feature_30d;
CREATE VIEW v_crash_by_feature_30d AS
SELECT
  COALESCE(active_feature, 'unknown') AS feature,
  COUNT(*) AS crashes,
  COUNT(DISTINCT session_id) AS affected_sessions,
  MAX(created_at) AS last_seen
FROM crash_reports
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
  AND app_version COLLATE utf8mb4_unicode_ci NOT IN ('verify', '0.0.0-test')
  AND platform COLLATE utf8mb4_unicode_ci NOT IN ('script', 'crash-ingest-selftest', 'test')
  AND source COLLATE utf8mb4_unicode_ci NOT IN ('script', 'selftest')
  AND (instance_id IS NULL OR instance_id COLLATE utf8mb4_unicode_ci NOT LIKE 'verify-%')
  AND error_message COLLATE utf8mb4_unicode_ci NOT LIKE '%Test error for pytest%'
  AND error_message COLLATE utf8mb4_unicode_ci NOT LIKE '%connectivity self-test%'
  AND error_message COLLATE utf8mb4_unicode_ci NOT LIKE '%Automated verify%'
  AND error_message COLLATE utf8mb4_unicode_ci NOT LIKE '%Enriched verify ping%'
  AND error_message COLLATE utf8mb4_unicode_ci NOT LIKE '[archived_test]%'
GROUP BY COALESCE(active_feature, 'unknown')
ORDER BY crashes DESC;
