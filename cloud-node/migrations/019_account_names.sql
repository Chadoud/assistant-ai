-- Migration 019: store registrant name on the account row (nullable for legacy / social-only).
ALTER TABLE accounts
  ADD COLUMN first_name VARCHAR(120) NULL AFTER email,
  ADD COLUMN last_name VARCHAR(120) NULL AFTER first_name;
