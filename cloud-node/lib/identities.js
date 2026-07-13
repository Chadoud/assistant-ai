/**
 * Resolve a verified provider identity to an EXO account, creating or linking as needed.
 *
 * Resolution order:
 *   1. Known (provider, subject) → that account.
 *   2. Verified email matches an existing account → link this identity to it.
 *   3. Otherwise → create a new social-only account (no password).
 */

const { v4: uuidv4 } = require("uuid");
const { getPool } = require("./db");
const { provisionAccount } = require("./accounts");

/**
 * @param {{ provider: "google" | "apple"; subject: string; email: string | null }} identity
 * @returns {Promise<{ account_id: string; email: string | null }>}
 */
async function resolveSocialAccount({ provider, subject, email }) {
  const pool = getPool();
  const normalizedEmail = email ? email.trim().toLowerCase() : null;

  const [identityRows] = await pool.execute(
    "SELECT account_id FROM auth_identities WHERE provider = ? AND provider_subject = ? LIMIT 1",
    [provider, subject],
  );
  if (identityRows.length > 0) {
    return { account_id: identityRows[0].account_id, email: normalizedEmail };
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    let accountId = null;
    if (normalizedEmail) {
      const [accountRows] = await conn.execute(
        "SELECT id FROM accounts WHERE email = ? AND is_active = 1 LIMIT 1",
        [normalizedEmail],
      );
      if (accountRows.length > 0) {
        accountId = accountRows[0].id;
      }
    }

    if (!accountId) {
      accountId = uuidv4();
      // Social accounts without a provider email still need a unique placeholder
      // (e.g. Apple private relay declined). Use a provider-scoped synthetic email.
      const emailForAccount = normalizedEmail || `${provider}_${subject}@users.exosites.ch`;
      await provisionAccount(conn, accountId, emailForAccount, null);
    }

    await conn.execute(
      `INSERT INTO auth_identities (account_id, provider, provider_subject, email_at_link)
       VALUES (?, ?, ?, ?)`,
      [accountId, provider, subject, normalizedEmail],
    );

    await conn.commit();
    return { account_id: accountId, email: normalizedEmail };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = { resolveSocialAccount };
