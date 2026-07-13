const { getPool } = require("./db");
const { messageBodyPreview } = require("./whatsappMeta");

/**
 * @param {string} accountId
 * @param {{
 *   phone_number_id: string;
 *   business_account_id?: string;
 *   display_phone_number?: string;
 * }} body
 */
async function upsertPhoneBinding(accountId, body) {
  const phoneNumberId = String(body.phone_number_id || "").trim();
  if (!phoneNumberId) {
    throw Object.assign(new Error("phone_number_id is required"), { status: 422 });
  }
  const pool = getPool();
  await pool.query(
    `INSERT INTO whatsapp_phone_bindings
      (phone_number_id, account_id, business_account_id, display_phone_number)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       account_id = VALUES(account_id),
       business_account_id = COALESCE(VALUES(business_account_id), business_account_id),
       display_phone_number = COALESCE(VALUES(display_phone_number), display_phone_number),
       updated_at = CURRENT_TIMESTAMP(6)`,
    [
      phoneNumberId,
      accountId,
      body.business_account_id ? String(body.business_account_id).trim() : null,
      body.display_phone_number ? String(body.display_phone_number).trim() : null,
    ],
  );
  return { phone_number_id: phoneNumberId };
}

/**
 * @param {string} accountId
 * @param {string} phoneNumberId
 */
async function deletePhoneBinding(accountId, phoneNumberId) {
  const pool = getPool();
  await pool.query(
    "DELETE FROM whatsapp_phone_bindings WHERE account_id = ? AND phone_number_id = ?",
    [accountId, phoneNumberId],
  );
}

/**
 * @param {string} phoneNumberId
 * @returns {Promise<string|null>}
 */
async function accountIdForPhoneNumber(phoneNumberId) {
  const pool = getPool();
  const [rows] = await pool.query(
    "SELECT account_id FROM whatsapp_phone_bindings WHERE phone_number_id = ? LIMIT 1",
    [phoneNumberId],
  );
  return rows[0]?.account_id ? String(rows[0].account_id) : null;
}

/**
 * @param {string} accountId
 * @param {number} retentionDays
 */
async function purgeOldEvents(accountId, retentionDays) {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return;
  const pool = getPool();
  await pool.query(
    "DELETE FROM whatsapp_events WHERE account_id = ? AND created_at < (NOW(6) - INTERVAL ? DAY)",
    [accountId, Math.floor(retentionDays)],
  );
}

/**
 * @param {string} accountId
 * @param {string} phoneNumberId
 * @param {object} change
 */
async function insertEventsFromWebhook(accountId, phoneNumberId, change) {
  const pool = getPool();
  const rows = [];

  for (const message of change.messages || []) {
    if (!message || typeof message !== "object") continue;
    rows.push([
      accountId,
      phoneNumberId,
      "message",
      message.id ? String(message.id) : null,
      message.from ? String(message.from) : null,
      null,
      null,
      messageBodyPreview(message),
      message.timestamp ? Number(message.timestamp) * 1000 : null,
    ]);
  }

  for (const status of change.statuses || []) {
    if (!status || typeof status !== "object") continue;
    rows.push([
      accountId,
      phoneNumberId,
      "status",
      status.id ? String(status.id) : null,
      null,
      status.recipient_id ? String(status.recipient_id) : null,
      status.status ? String(status.status) : null,
      null,
      status.timestamp ? Number(status.timestamp) * 1000 : null,
    ]);
  }

  if (rows.length === 0) return 0;

  const placeholders = rows.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
  const flat = rows.flat();
  await pool.query(
    `INSERT INTO whatsapp_events
      (account_id, phone_number_id, event_type, wa_message_id, from_e164, to_e164, status, body_preview, meta_timestamp_ms)
     VALUES ${placeholders}`,
    flat,
  );
  return rows.length;
}

/**
 * @param {string} accountId
 * @param {number} sinceId
 * @param {number} limit
 */
async function listEvents(accountId, sinceId, limit) {
  const pool = getPool();
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const safeSince = Math.max(Number(sinceId) || 0, 0);
  const [rows] = await pool.query(
    `SELECT id, phone_number_id, event_type, wa_message_id, from_e164, to_e164,
            status, body_preview, meta_timestamp_ms,
            UNIX_TIMESTAMP(created_at) * 1000 AS created_at_ms
     FROM whatsapp_events
     WHERE account_id = ? AND id > ?
     ORDER BY id ASC
     LIMIT ?`,
    [accountId, safeSince, safeLimit],
  );
  const events = rows.map((row) => ({
    id: Number(row.id),
    phone_number_id: row.phone_number_id,
    event_type: row.event_type,
    wa_message_id: row.wa_message_id,
    from_e164: row.from_e164,
    to_e164: row.to_e164,
    status: row.status,
    body_preview: row.body_preview,
    meta_timestamp_ms: row.meta_timestamp_ms ? Number(row.meta_timestamp_ms) : null,
    created_at_ms: row.created_at_ms ? Number(row.created_at_ms) : null,
  }));
  const nextSinceId =
    events.length > 0 ? events[events.length - 1].id : safeSince;
  return { events, next_since_id: nextSinceId };
}

module.exports = {
  upsertPhoneBinding,
  deletePhoneBinding,
  accountIdForPhoneNumber,
  insertEventsFromWebhook,
  listEvents,
  purgeOldEvents,
};
