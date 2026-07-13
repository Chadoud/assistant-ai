/**
 * Single-use handoff codes. After a social sign-in completes in the desktop's auth
 * window, the server stores a hashed code; the desktop exchanges it once for JWTs.
 * Codes are short-lived and consumed atomically so they cannot be replayed.
 */

const crypto = require("crypto");
const config = require("./config");
const { getPool } = require("./db");

function hashCode(code) {
  return crypto.createHash("sha256").update(String(code)).digest("hex");
}

/**
 * Create a one-time code bound to an account.
 * @param {string} accountId
 * @returns {Promise<string>} the plaintext code (returned to the caller only once)
 */
async function createExchangeCode(accountId) {
  const code = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + config.exchangeCodeTtlSeconds * 1000);
  const pool = getPool();
  await pool.execute(
    "INSERT INTO auth_exchange_codes (code_hash, account_id, expires_at) VALUES (?, ?, ?)",
    [hashCode(code), accountId, expiresAt],
  );
  return code;
}

/**
 * Atomically consume a code. Returns the account id, or null if missing/expired/used.
 * @param {string} code
 * @returns {Promise<string | null>}
 */
async function consumeExchangeCode(code) {
  const pool = getPool();
  const codeHash = hashCode(code);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute(
      `SELECT account_id FROM auth_exchange_codes
       WHERE code_hash = ? AND consumed = 0 AND expires_at > UTC_TIMESTAMP()
       FOR UPDATE`,
      [codeHash],
    );
    const row = rows[0];
    if (!row) {
      await conn.rollback();
      return null;
    }
    await conn.execute(
      "UPDATE auth_exchange_codes SET consumed = 1 WHERE code_hash = ?",
      [codeHash],
    );
    await conn.commit();
    return row.account_id;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = { createExchangeCode, consumeExchangeCode, hashCode };
