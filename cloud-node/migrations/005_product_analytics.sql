-- Migration 005 — central product analytics (dashboard-ready, one row per event).
-- Run on YOUR_IK_ID_exo_app (single DB). Crash data stays in crash_reports (see 001).

CREATE TABLE IF NOT EXISTS telemetry_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  account_id CHAR(36) NULL,
  instance_id VARCHAR(128) NOT NULL,
  app_version VARCHAR(64) NOT NULL,
  platform VARCHAR(64) NOT NULL,
  locale VARCHAR(16) NOT NULL,
  event_name VARCHAR(128) NOT NULL,
  event_props JSON NULL,
  client_ts_ms BIGINT NULL,
  KEY idx_tel_created (created_at),
  KEY idx_tel_event_day (event_name, created_at),
  KEY idx_tel_account (account_id),
  KEY idx_tel_app_version (app_version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS product_feedback (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  account_id CHAR(36) NULL,
  instance_id VARCHAR(128) NOT NULL,
  app_version VARCHAR(64) NOT NULL,
  locale VARCHAR(16) NOT NULL,
  category VARCHAR(16) NOT NULL,
  message TEXT NOT NULL,
  KEY idx_fb_created (created_at),
  KEY idx_fb_category (category, created_at),
  KEY idx_fb_account (account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
