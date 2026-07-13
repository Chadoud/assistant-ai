-- Migration 012 — crash intelligence + telemetry session_id (MariaDB 10.11+).
-- Idempotent: apply-migration-012.js skips duplicate-column errors.

ALTER TABLE crash_reports
  ADD COLUMN crash_uuid CHAR(36) NULL AFTER id,
  ADD COLUMN instance_id VARCHAR(128) NULL,
  ADD COLUMN session_id VARCHAR(128) NULL,
  ADD COLUMN account_id CHAR(36) NULL,
  ADD COLUMN crash_signature VARCHAR(64) NULL,
  ADD COLUMN source_detail VARCHAR(64) NULL,
  ADD COLUMN active_feature VARCHAR(64) NULL,
  ADD COLUMN active_tab VARCHAR(64) NULL,
  ADD COLUMN last_events_json JSON NULL,
  ADD COLUMN intent_bucket VARCHAR(64) NULL,
  ADD COLUMN tool_name VARCHAR(64) NULL,
  ADD COLUMN llm_provider VARCHAR(32) NULL,
  ADD COLUMN llm_error_class VARCHAR(32) NULL,
  ADD COLUMN conversation_id_hash CHAR(64) NULL,
  ADD COLUMN dedupe_key VARCHAR(64) NULL,
  ADD COLUMN sentry_event_id VARCHAR(64) NULL;

ALTER TABLE crash_reports
  ADD KEY idx_crash_session (session_id),
  ADD KEY idx_crash_instance (instance_id),
  ADD KEY idx_crash_account (account_id),
  ADD KEY idx_crash_signature (crash_signature);

ALTER TABLE telemetry_events
  ADD COLUMN session_id VARCHAR(128) NULL,
  ADD KEY idx_te_session (session_id);

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
ORDER BY c.created_at DESC;
