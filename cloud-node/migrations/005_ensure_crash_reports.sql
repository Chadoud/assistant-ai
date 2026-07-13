-- Ensures crash_reports exists before dashboard views (idempotent).
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
