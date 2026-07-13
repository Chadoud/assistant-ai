const { getPool } = require("./db");

/**
 * Whether the account is on the product admin allowlist (snapshot debug in production builds).
 * @param {string} accountId
 * @returns {Promise<boolean>}
 */
async function isAccountProductAdmin(accountId) {
  const pool = getPool();
  try {
    const [rows] = await pool.execute(
      "SELECT 1 FROM product_admins WHERE account_id = ? LIMIT 1",
      [accountId],
    );
    return rows.length > 0;
  } catch (e) {
    if (e?.code === "ER_NO_SUCH_TABLE") return false;
    throw e;
  }
}

module.exports = { isAccountProductAdmin };
