/**
 * Refresh-token rotation with per-account jti binding (detects token reuse).
 */

const { v4: uuidv4 } = require("uuid");
const config = require("./config");
const { getPool } = require("./db");
const { signAccessToken, signRefreshToken, decodeToken } = require("./tokens");

/**
 * @param {string} accountId
 * @param {string | null} jti
 */
async function setAccountRefreshJti(accountId, jti) {
  const pool = getPool();
  await pool.execute("UPDATE accounts SET refresh_token_jti = ? WHERE id = ? LIMIT 1", [jti, accountId]);
}

/**
 * @param {string} accountId
 * @returns {Promise<string | null>}
 */
async function getAccountRefreshJti(accountId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    "SELECT refresh_token_jti FROM accounts WHERE id = ? LIMIT 1",
    [accountId],
  );
  const jti = rows[0]?.refresh_token_jti;
  return typeof jti === "string" && jti.trim() ? jti.trim() : null;
}

/**
 * Invalidate every refresh token for the account (reuse attack or logout-all).
 * @param {string} accountId
 */
async function revokeAccountRefreshTokens(accountId) {
  await setAccountRefreshJti(accountId, null);
}

/**
 * Issue a fresh access + refresh pair and bind the refresh jti server-side.
 * @param {string} accountId
 */
async function issueAuthTokens(accountId) {
  const jti = uuidv4();
  await setAccountRefreshJti(accountId, jti);
  return {
    access_token: signAccessToken(accountId),
    refresh_token: signRefreshToken(accountId, jti),
    token_type: "bearer",
    expires_in: config.accessMinutes * 60,
  };
}

/**
 * Validate a refresh token, rotate to a new jti, and return fresh tokens.
 * @param {string} refreshToken
 * @returns {Promise<
 *   { ok: true; access_token: string; refresh_token: string; token_type: string; expires_in: number }
 *   | { ok: false; status: number; detail: string }
 * >}
 */
async function rotateAuthTokens(refreshToken) {
  const payload = decodeToken(refreshToken);
  if (!payload || payload.token_use !== "refresh" || !payload.sub) {
    return { ok: false, status: 401, detail: "Invalid refresh token" };
  }
  const accountId = String(payload.sub);
  const presentedJti = typeof payload.jti === "string" ? payload.jti.trim() : "";
  if (!presentedJti) {
    await revokeAccountRefreshTokens(accountId);
    return { ok: false, status: 401, detail: "Invalid refresh token" };
  }

  const storedJti = await getAccountRefreshJti(accountId);
  if (!storedJti || storedJti !== presentedJti) {
    await revokeAccountRefreshTokens(accountId);
    return { ok: false, status: 401, detail: "Invalid refresh token" };
  }

  const nextJti = uuidv4();
  await setAccountRefreshJti(accountId, nextJti);
  return {
    ok: true,
    access_token: signAccessToken(accountId),
    refresh_token: signRefreshToken(accountId, nextJti),
    token_type: "bearer",
    expires_in: config.accessMinutes * 60,
  };
}

module.exports = {
  issueAuthTokens,
  rotateAuthTokens,
  revokeAccountRefreshTokens,
  getAccountRefreshJti,
  setAccountRefreshJti,
};
