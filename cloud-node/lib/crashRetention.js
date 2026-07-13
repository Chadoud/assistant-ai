/** Delete cloud crash report rows older than the retention window. */

const DEFAULT_CRASH_RETENTION_DAYS = 90;

/**
 * @param {import("mysql2/promise").Pool} pool
 * @param {number} [days]
 * @returns {Promise<number>} rows deleted
 */
async function pruneCrashReportsOlderThan(pool, days = DEFAULT_CRASH_RETENTION_DAYS) {
  if (!pool) {
    throw new Error("database pool required");
  }
  const safeDays = Math.max(1, Math.min(Math.floor(days), 3650));
  const [result] = await pool.query(
    "DELETE FROM crash_reports WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)",
    [safeDays]
  );
  return Number(result?.affectedRows ?? 0);
}

module.exports = {
  DEFAULT_CRASH_RETENTION_DAYS,
  pruneCrashReportsOlderThan,
};
