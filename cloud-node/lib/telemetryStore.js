/**
 * @typedef {object} TelemetryEventRow
 * @property {string} instance_id
 * @property {string | null} session_id
 * @property {string} app_version
 * @property {string} platform
 * @property {string} locale
 * @property {string} event_name
 * @property {string | null} event_props
 * @property {number | null} client_ts_ms
 */

/**
 * @param {import("mysql2/promise").Pool} pool
 * @param {string | null} accountId
 * @param {TelemetryEventRow[]} rows
 */
async function insertTelemetryEvents(pool, accountId, rows) {
  if (rows.length === 0) return;
  const placeholders = rows.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
  const params = [];
  for (const row of rows) {
    params.push(
      accountId,
      row.instance_id,
      row.session_id,
      row.app_version,
      row.platform,
      row.locale,
      row.event_name,
      row.event_props,
      row.client_ts_ms,
    );
  }
  await pool.query(
    `INSERT INTO telemetry_events
      (account_id, instance_id, session_id, app_version, platform, locale, event_name, event_props, client_ts_ms)
     VALUES ${placeholders}`,
    params,
  );
}

/**
 * @param {import("mysql2/promise").Pool} pool
 * @param {string | null} accountId
 * @param {object} row
 */
async function insertProductFeedback(pool, accountId, row) {
  await pool.query(
    `INSERT INTO product_feedback
      (account_id, instance_id, app_version, locale, category, message)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [accountId, row.instance_id, row.app_version, row.locale, row.category, row.message],
  );
}

module.exports = { insertTelemetryEvents, insertProductFeedback };
