-- Migration 002 — social sign-in (Google / Apple).
--
-- Adds linked-identity support so one account can sign in with email/password,
-- Google, or Apple. Run in phpMyAdmin (SQL tab) on the app database.

-- 1) Social-only accounts have no password.
ALTER TABLE accounts MODIFY password_hash VARCHAR(255) NULL;

-- 2) Linked sign-in identities (provider + the provider's stable user id).
CREATE TABLE IF NOT EXISTS auth_identities (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  provider VARCHAR(16) NOT NULL,
  provider_subject VARCHAR(255) NOT NULL,
  email_at_link VARCHAR(320) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_identity_provider_subject (provider, provider_subject),
  KEY idx_identity_account (account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3) Single-use handoff codes for the desktop app.
CREATE TABLE IF NOT EXISTS auth_exchange_codes (
  code_hash CHAR(64) NOT NULL PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  expires_at DATETIME NOT NULL,
  consumed TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_exchange_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
