-- Migration 020 — expose registrant first_name / last_name in DataSuite account activity.
-- Depends on migration 019 (accounts.first_name, accounts.last_name).

DROP VIEW IF EXISTS v_account_activity;

CREATE VIEW v_account_activity AS
SELECT
  te.account_id,
  a.email,
  a.first_name,
  a.last_name,
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
GROUP BY te.account_id, a.email, a.first_name, a.last_name;
