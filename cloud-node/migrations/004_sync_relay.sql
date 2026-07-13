-- GO SYNC relay — encrypted blob storage (zero-knowledge, ciphertext only).
CREATE TABLE IF NOT EXISTS sync_devices (
  id CHAR(36) NOT NULL PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  platform VARCHAR(16) NOT NULL,
  push_token VARCHAR(512) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_sync_devices_account (account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sync_blobs (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  collection VARCHAR(64) NOT NULL,
  record_id VARCHAR(128) NOT NULL,
  device_id VARCHAR(64) NOT NULL,
  logical_clock BIGINT NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  deleted TINYINT(1) NOT NULL DEFAULT 0,
  schema_version INT NOT NULL DEFAULT 1,
  ciphertext MEDIUMTEXT NOT NULL,
  content_hash CHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sync_blob (account_id, collection, record_id),
  KEY idx_sync_pull (account_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sync_cursors (
  account_id CHAR(36) NOT NULL PRIMARY KEY,
  cursor_value BIGINT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
