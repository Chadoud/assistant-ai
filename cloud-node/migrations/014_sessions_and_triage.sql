-- Migration 014 — app sessions, crash triage workflow, install health views.

CREATE TABLE IF NOT EXISTS app_sessions (
  session_id VARCHAR(128) NOT NULL PRIMARY KEY,
  instance_id VARCHAR(128) NOT NULL,
  account_id CHAR(36) NULL,
  started_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  ended_at DATETIME(6) NULL,
  app_version VARCHAR(64) NOT NULL DEFAULT 'unknown',
  platform VARCHAR(64) NOT NULL DEFAULT 'unknown',
  crashed TINYINT(1) NOT NULL DEFAULT 0,
  crash_id BIGINT NULL,
  KEY idx_as_instance (instance_id),
  KEY idx_as_account (account_id),
  KEY idx_as_ended (ended_at),
  KEY idx_as_crashed (crashed, ended_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crash_triage (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  crash_signature VARCHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'new',
  notes TEXT NULL,
  fixed_in_version VARCHAR(64) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_crash_triage_signature (crash_signature),
  KEY idx_crash_triage_status (status, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP VIEW IF EXISTS v_install_health_30d;
CREATE VIEW v_install_health_30d AS
SELECT
  s.instance_id,
  COUNT(*) AS sessions,
  SUM(s.crashed) AS crashed_sessions,
  ROUND(SUM(s.crashed) / NULLIF(COUNT(*), 0) * 100, 2) AS crash_session_rate_pct,
  MAX(s.ended_at) AS last_session_at,
  MAX(s.app_version) AS last_app_version
FROM app_sessions s
WHERE s.started_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY s.instance_id;

DROP VIEW IF EXISTS v_account_health_30d;
CREATE VIEW v_account_health_30d AS
SELECT
  s.account_id,
  COUNT(DISTINCT s.instance_id) AS devices,
  COUNT(*) AS sessions,
  SUM(s.crashed) AS crashed_sessions,
  MAX(s.ended_at) AS last_session_at
FROM app_sessions s
WHERE s.account_id IS NOT NULL
  AND s.started_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY s.account_id;
