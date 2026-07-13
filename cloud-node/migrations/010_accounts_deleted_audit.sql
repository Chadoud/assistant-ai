-- Migration 010 — account deletion audit (no PII; hash only).
-- Re-run safe.

CREATE TABLE IF NOT EXISTS accounts_deleted_at (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  deleted_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  account_id_hash CHAR(64) NOT NULL,
  UNIQUE KEY uq_account_deleted_hash (account_id_hash),
  KEY idx_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
