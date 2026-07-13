-- Migration 001 — consolidate crash reports into the main app database.
--
-- Context: crash rows used to live in a dedicated database (YOUR_IK_ID_crash_reports).
-- They now belong to a single table inside the app database (YOUR_IK_ID_exo_app) so the
-- Node API is the only service holding DB credentials.
--
-- Run in phpMyAdmin (SQL tab) while connected to YOUR_IK_ID_exo_app. The login user must
-- have SELECT on the old database. Replace the names below if your prefixes differ.
--
-- 1) Ensure the destination table exists (no-op if schema.sql already ran).
CREATE TABLE IF NOT EXISTS crash_reports (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  app_version VARCHAR(64) NOT NULL,
  environment VARCHAR(32) NOT NULL,
  ui_locale VARCHAR(32) NULL,
  platform VARCHAR(512) NULL,
  source VARCHAR(32) NOT NULL,
  error_message TEXT NOT NULL,
  stack_trace LONGTEXT NULL,
  KEY idx_crash_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2) Copy existing rows from the old database. Preserves ids and timestamps.
--    Safe to re-run: only rows whose id is not already present are inserted.
INSERT INTO crash_reports
  (id, created_at, app_version, environment, ui_locale, platform, source, error_message, stack_trace)
SELECT
  old.id, old.created_at, old.app_version, old.environment, old.ui_locale,
  old.platform, old.source, old.error_message, old.stack_trace
FROM `YOUR_IK_ID_crash_reports`.`crash_reports` AS old
LEFT JOIN crash_reports AS cur ON cur.id = old.id
WHERE cur.id IS NULL;

-- 3) Verify, then decommission the old database manually once counts match:
--      SELECT COUNT(*) FROM `YOUR_IK_ID_crash_reports`.`crash_reports`;
--      SELECT COUNT(*) FROM crash_reports;
--    When equal, drop the old database from the Infomaniak panel.
