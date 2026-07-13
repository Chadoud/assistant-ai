/**
 * @param {import("mysql2/promise").Pool} pool
 * @param {string} tableName
 * @returns {Promise<boolean>}
 */
async function tableExists(pool, tableName) {
  try {
    const [rows] = await pool.query(
      "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
      [tableName],
    );
    return Number(rows[0]?.n || 0) > 0;
  } catch {
    return false;
  }
}

/**
 * @param {import("mysql2/promise").Pool} pool
 * @returns {Promise<boolean>}
 */
async function syncRelayTablesReady(pool) {
  return tableExists(pool, "sync_blobs");
}

/**
 * @param {import("mysql2/promise").Pool} pool
 * @returns {Promise<boolean>}
 */
async function productAnalyticsReady(pool) {
  return (
    (await tableExists(pool, "telemetry_events")) &&
    (await tableExists(pool, "product_feedback"))
  );
}

/**
 * @param {import("mysql2/promise").Pool} pool
 * @returns {Promise<boolean>}
 */
async function whatsappWebhookReady(pool) {
  return (
    (await tableExists(pool, "whatsapp_events")) &&
    (await tableExists(pool, "whatsapp_phone_bindings"))
  );
}

module.exports = { tableExists, syncRelayTablesReady, productAnalyticsReady, whatsappWebhookReady };
