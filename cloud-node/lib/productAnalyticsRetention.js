/**
 * @param {import("mysql2/promise").Pool} pool
 * @param {number} days
 * @returns {Promise<number>} rows removed
 */
async function pruneTelemetryOlderThan(pool, days) {
  const d = Math.max(30, Math.min(365, Number(days) || 90));
  const [result] = await pool.query(
    "DELETE FROM telemetry_events WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)",
    [d],
  );
  return Number(result.affectedRows || 0);
}

/**
 * @param {import("mysql2/promise").Pool} pool
 * @param {number} days
 * @returns {Promise<number>} rows removed
 */
async function pruneFeedbackOlderThan(pool, days) {
  const d = Math.max(180, Math.min(730, Number(days) || 365));
  const [result] = await pool.query(
    "DELETE FROM product_feedback WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)",
    [d],
  );
  return Number(result.affectedRows || 0);
}

module.exports = { pruneTelemetryOlderThan, pruneFeedbackOlderThan };
