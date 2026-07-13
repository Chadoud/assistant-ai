-- Product admins: accounts allowed to use in-app snapshot debug tools in production builds.
-- Auth is still account login; this table is an allowlist keyed by accounts.id.

CREATE TABLE IF NOT EXISTS product_admins (
  account_id CHAR(36) NOT NULL PRIMARY KEY,
  email VARCHAR(320) NOT NULL,
  note VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_product_admins_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed founding admin (idempotent).
INSERT INTO product_admins (account_id, email, note)
SELECT id, email, 'Founding admin'
FROM accounts
WHERE email = 'chadykassab@gmail.com'
LIMIT 1
ON DUPLICATE KEY UPDATE email = VALUES(email);
