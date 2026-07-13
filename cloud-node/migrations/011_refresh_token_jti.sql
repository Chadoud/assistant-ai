-- Refresh-token rotation: one active jti per account; stale reuse revokes all refresh tokens.
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS refresh_token_jti CHAR(36) NULL AFTER trial_ends_at;
