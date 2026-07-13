-- Migration 018 — review funnel, setup milestones, assistant intent views for DataSuite.
-- Depends on review_*, setup_milestone, and intent_bucket telemetry (desktop G4–G6).

DROP VIEW IF EXISTS v_assistant_intent_30d;
DROP VIEW IF EXISTS v_setup_milestones_30d;
DROP VIEW IF EXISTS v_review_funnel_30d;

CREATE VIEW v_review_funnel_30d AS
SELECT
  SUM(event_name COLLATE utf8mb4_unicode_ci = 'review_opened') AS review_opened,
  SUM(event_name COLLATE utf8mb4_unicode_ci = 'review_bulk_applied') AS bulk_applied,
  SUM(event_name COLLATE utf8mb4_unicode_ci = 'review_reassign') AS reassigns,
  SUM(event_name COLLATE utf8mb4_unicode_ci = 'review_dismissed') AS dismissed,
  CASE
    WHEN SUM(event_name COLLATE utf8mb4_unicode_ci = 'review_opened') > 0
    THEN ROUND(
      (SUM(event_name COLLATE utf8mb4_unicode_ci = 'review_bulk_applied')
       / SUM(event_name COLLATE utf8mb4_unicode_ci = 'review_opened')) * 100,
      1
    )
    ELSE NULL
  END AS apply_rate_pct
FROM telemetry_events
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
  AND event_name COLLATE utf8mb4_unicode_ci IN (
    'review_opened', 'review_bulk_applied', 'review_reassign', 'review_dismissed'
  )
  AND app_version COLLATE utf8mb4_unicode_ci <> 'verify'
  AND platform COLLATE utf8mb4_unicode_ci <> 'script'
  AND instance_id COLLATE utf8mb4_unicode_ci NOT LIKE 'verify-%';

CREATE VIEW v_setup_milestones_30d AS
SELECT
  JSON_UNQUOTE(JSON_EXTRACT(event_props, '$.milestone')) AS milestone,
  COUNT(*) AS first_hits,
  COUNT(DISTINCT instance_id) AS unique_installs
FROM telemetry_events
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
  AND event_name COLLATE utf8mb4_unicode_ci = 'setup_milestone'
  AND app_version COLLATE utf8mb4_unicode_ci <> 'verify'
  AND platform COLLATE utf8mb4_unicode_ci <> 'script'
  AND instance_id COLLATE utf8mb4_unicode_ci NOT LIKE 'verify-%'
  AND JSON_UNQUOTE(JSON_EXTRACT(event_props, '$.milestone')) IS NOT NULL
  AND JSON_UNQUOTE(JSON_EXTRACT(event_props, '$.milestone')) <> ''
GROUP BY JSON_UNQUOTE(JSON_EXTRACT(event_props, '$.milestone'))
ORDER BY first_hits DESC;

CREATE VIEW v_assistant_intent_30d AS
SELECT
  JSON_UNQUOTE(JSON_EXTRACT(event_props, '$.intent_bucket')) AS intent_bucket,
  COUNT(*) AS turns,
  COUNT(DISTINCT instance_id) AS unique_installs
FROM telemetry_events
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
  AND event_name COLLATE utf8mb4_unicode_ci IN (
    'assistant_turn_started', 'assistant_turn_completed', 'assistant_turn_failed'
  )
  AND app_version COLLATE utf8mb4_unicode_ci <> 'verify'
  AND platform COLLATE utf8mb4_unicode_ci <> 'script'
  AND instance_id COLLATE utf8mb4_unicode_ci NOT LIKE 'verify-%'
  AND JSON_UNQUOTE(JSON_EXTRACT(event_props, '$.intent_bucket')) IS NOT NULL
  AND JSON_UNQUOTE(JSON_EXTRACT(event_props, '$.intent_bucket')) <> ''
GROUP BY JSON_UNQUOTE(JSON_EXTRACT(event_props, '$.intent_bucket'))
ORDER BY turns DESC;
