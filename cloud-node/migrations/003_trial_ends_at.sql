-- Migration 003: time-based free trial (replaces byte-meter wallet seeding).
ALTER TABLE accounts ADD COLUMN trial_ends_at DATETIME NULL;

-- New column only: give every account a fresh 14-day window from migration time.
UPDATE accounts
SET trial_ends_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 14 DAY)
WHERE trial_ends_at IS NULL;
