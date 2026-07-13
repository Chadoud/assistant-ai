-- Migration 007 — WhatsApp Business webhook relay (inbound messages + delivery status).
-- Maps Meta phone_number_id → Exo cloud account; stores events for desktop polling.

CREATE TABLE IF NOT EXISTS whatsapp_phone_bindings (
  phone_number_id VARCHAR(64) NOT NULL PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  business_account_id VARCHAR(64) NULL,
  display_phone_number VARCHAR(32) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  KEY idx_wa_bind_account (account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS whatsapp_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  phone_number_id VARCHAR(64) NOT NULL,
  event_type VARCHAR(32) NOT NULL,
  wa_message_id VARCHAR(128) NULL,
  from_e164 VARCHAR(32) NULL,
  to_e164 VARCHAR(32) NULL,
  status VARCHAR(32) NULL,
  body_preview VARCHAR(512) NULL,
  meta_timestamp_ms BIGINT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY idx_wa_ev_account_id (account_id, id),
  KEY idx_wa_ev_created (created_at),
  KEY idx_wa_ev_wa_msg (wa_message_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
