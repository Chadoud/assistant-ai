-- Migration 013 — Product intelligence views for DataSuite executive brief.
-- Depends on migration 012 (crash context columns) and assistant telemetry events.

DROP VIEW IF EXISTS v_feature_engagement_30d;
CREATE VIEW v_feature_engagement_30d AS
SELECT
  JSON_UNQUOTE(JSON_EXTRACT(event_props, '$.feature')) AS feature,
  SUM(CASE WHEN event_name = 'feature_entered' THEN 1 ELSE 0 END) AS entries,
  SUM(CASE WHEN event_name = 'feature_exited' THEN 1 ELSE 0 END) AS exits,
  SUM(CASE WHEN event_name = 'feature_exited' AND JSON_UNQUOTE(JSON_EXTRACT(event_props, '$.duration_bucket')) = '0-5s' THEN 1 ELSE 0 END) AS bucket_0_5s,
  SUM(CASE WHEN event_name = 'feature_exited' AND JSON_UNQUOTE(JSON_EXTRACT(event_props, '$.duration_bucket')) = '5-30s' THEN 1 ELSE 0 END) AS bucket_5_30s,
  SUM(CASE WHEN event_name = 'feature_exited' AND JSON_UNQUOTE(JSON_EXTRACT(event_props, '$.duration_bucket')) = '30s-2m' THEN 1 ELSE 0 END) AS bucket_30s_2m,
  SUM(CASE WHEN event_name = 'feature_exited' AND JSON_UNQUOTE(JSON_EXTRACT(event_props, '$.duration_bucket')) = '2-10m' THEN 1 ELSE 0 END) AS bucket_2_10m,
  SUM(CASE WHEN event_name = 'feature_exited' AND JSON_UNQUOTE(JSON_EXTRACT(event_props, '$.duration_bucket')) = '10m+' THEN 1 ELSE 0 END) AS bucket_10m_plus
FROM telemetry_events
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
  AND event_name IN ('feature_entered', 'feature_exited')
  AND app_version <> 'verify'
  AND platform <> 'script'
  AND instance_id NOT LIKE 'verify-%'
GROUP BY JSON_UNQUOTE(JSON_EXTRACT(event_props, '$.feature'))
HAVING feature IS NOT NULL AND feature <> '';

DROP VIEW IF EXISTS v_assistant_ops_30d;
CREATE VIEW v_assistant_ops_30d AS
SELECT
  SUM(CASE WHEN event_name = 'assistant_turn_started' THEN 1 ELSE 0 END) AS turns_started,
  SUM(CASE WHEN event_name = 'assistant_turn_completed' THEN 1 ELSE 0 END) AS turns_completed,
  SUM(CASE WHEN event_name = 'assistant_turn_failed' THEN 1 ELSE 0 END) AS turns_failed,
  SUM(CASE WHEN event_name = 'provider_error' THEN 1 ELSE 0 END) AS provider_errors,
  SUM(CASE WHEN event_name = 'assistant_tool_invoked' THEN 1 ELSE 0 END) AS tools_invoked
FROM telemetry_events
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
  AND event_name IN (
    'assistant_turn_started',
    'assistant_turn_completed',
    'assistant_turn_failed',
    'provider_error',
    'assistant_tool_invoked'
  )
  AND app_version <> 'verify'
  AND platform <> 'script'
  AND instance_id NOT LIKE 'verify-%';

DROP VIEW IF EXISTS v_assistant_tools_30d;
CREATE VIEW v_assistant_tools_30d AS
SELECT
  JSON_UNQUOTE(JSON_EXTRACT(event_props, '$.tool_name')) AS tool_name,
  COUNT(*) AS invocations
FROM telemetry_events
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
  AND event_name = 'assistant_tool_invoked'
  AND app_version <> 'verify'
  AND platform <> 'script'
  AND instance_id NOT LIKE 'verify-%'
GROUP BY JSON_UNQUOTE(JSON_EXTRACT(event_props, '$.tool_name'))
HAVING tool_name IS NOT NULL AND tool_name <> ''
ORDER BY invocations DESC;

DROP VIEW IF EXISTS v_crash_by_feature_30d;
CREATE VIEW v_crash_by_feature_30d AS
SELECT
  COALESCE(active_feature, 'unknown') AS feature,
  COUNT(*) AS crashes,
  COUNT(DISTINCT session_id) AS affected_sessions,
  MAX(created_at) AS last_seen
FROM crash_reports
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY COALESCE(active_feature, 'unknown')
ORDER BY crashes DESC;

DROP VIEW IF EXISTS v_integration_health_30d;
CREATE VIEW v_integration_health_30d AS
SELECT
  JSON_UNQUOTE(JSON_EXTRACT(event_props, '$.provider')) AS provider,
  SUM(CASE WHEN event_name = 'integration_connect_completed' THEN 1 ELSE 0 END) AS connects_ok,
  SUM(CASE WHEN event_name = 'integration_connect_failed' THEN 1 ELSE 0 END) AS connects_failed
FROM telemetry_events
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
  AND event_name IN ('integration_connect_completed', 'integration_connect_failed')
  AND app_version <> 'verify'
  AND platform <> 'script'
  AND instance_id NOT LIKE 'verify-%'
GROUP BY JSON_UNQUOTE(JSON_EXTRACT(event_props, '$.provider'))
HAVING provider IS NOT NULL AND provider <> '';

DROP VIEW IF EXISTS v_messaging_health_30d;
CREATE VIEW v_messaging_health_30d AS
SELECT
  JSON_UNQUOTE(JSON_EXTRACT(event_props, '$.platform')) AS platform,
  SUM(CASE WHEN event_name = 'send_message_started' THEN 1 ELSE 0 END) AS started,
  SUM(CASE WHEN event_name = 'send_message_completed' THEN 1 ELSE 0 END) AS completed,
  SUM(CASE WHEN event_name = 'send_message_failed' THEN 1 ELSE 0 END) AS failed
FROM telemetry_events
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
  AND event_name IN ('send_message_started', 'send_message_completed', 'send_message_failed')
  AND app_version <> 'verify'
  AND platform <> 'script'
  AND instance_id NOT LIKE 'verify-%'
GROUP BY JSON_UNQUOTE(JSON_EXTRACT(event_props, '$.platform'))
HAVING platform IS NOT NULL AND platform <> '';
