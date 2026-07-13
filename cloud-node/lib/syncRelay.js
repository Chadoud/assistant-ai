const { v4: uuidv4 } = require("uuid");
const { getPool } = require("./db");

/**
 * Register a sync device for push notifications (optional token).
 * @param {string} accountId
 * @param {{ name: string; platform: string; pushToken?: string | null }} input
 */
async function registerDevice(accountId, input) {
  const pool = getPool();
  const id = input.deviceId || uuidv4();
  await pool.query(
    `INSERT INTO sync_devices (id, account_id, name, platform, push_token)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       name = VALUES(name),
       platform = VALUES(platform),
       push_token = VALUES(push_token),
       updated_at = CURRENT_TIMESTAMP`,
    [id, accountId, input.name, input.platform, input.pushToken || null],
  );
  return { device_id: id, ok: true };
}

/**
 * Upsert encrypted blob envelopes for an account.
 * @param {string} accountId
 * @param {object[]} blobs
 */
async function pushBlobs(accountId, blobs) {
  const pool = getPool();
  let accepted = 0;
  for (const blob of blobs) {
    const collection = String(blob.collection || "");
    const recordId = String(blob.record_id || "");
    if (!collection || !recordId) continue;
    await pool.query(
      `INSERT INTO sync_blobs
        (account_id, collection, record_id, device_id, logical_clock, updated_at, deleted, schema_version, ciphertext, content_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         device_id = IF(VALUES(logical_clock) >= logical_clock, VALUES(device_id), device_id),
         logical_clock = IF(VALUES(logical_clock) >= logical_clock, VALUES(logical_clock), logical_clock),
         updated_at = IF(VALUES(logical_clock) >= logical_clock, VALUES(updated_at), updated_at),
         deleted = IF(VALUES(logical_clock) >= logical_clock, VALUES(deleted), deleted),
         ciphertext = IF(VALUES(logical_clock) >= logical_clock, VALUES(ciphertext), ciphertext),
         content_hash = IF(VALUES(logical_clock) >= logical_clock, VALUES(content_hash), content_hash)`,
      [
        accountId,
        collection,
        recordId,
        String(blob.device_id || ""),
        Number(blob.logical_clock || 0),
        String(blob.updated_at || ""),
        blob.deleted ? 1 : 0,
        Number(blob.schema_version || 1),
        String(blob.ciphertext || ""),
        String(blob.content_hash || ""),
      ],
    );
    accepted += 1;
  }
  const [rows] = await pool.query(
    "SELECT COALESCE(MAX(id), 0) AS max_blob_id FROM sync_blobs WHERE account_id = ?",
    [accountId],
  );
  const cursor = rows[0]?.max_blob_id ?? 0;
  await pool.query(
    `INSERT INTO sync_cursors (account_id, cursor_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE cursor_value = GREATEST(cursor_value, VALUES(cursor_value))`,
    [accountId, cursor],
  );
  return { accepted, cursor };
}

/**
 * Pull blobs after cursor for an account.
 * @param {string} accountId
 * @param {number} cursor
 * @param {number} limit
 */
async function pullBlobs(accountId, cursor, limit) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT collection, record_id, device_id, logical_clock, updated_at, deleted, schema_version, ciphertext, content_hash, id
     FROM sync_blobs
     WHERE account_id = ? AND id > ?
     ORDER BY id ASC
     LIMIT ?`,
    [accountId, cursor, limit],
  );
  const blobs = rows.map((r) => ({
    collection: r.collection,
    record_id: r.record_id,
    device_id: r.device_id,
    logical_clock: Number(r.logical_clock),
    updated_at: r.updated_at,
    deleted: Boolean(r.deleted),
    schema_version: Number(r.schema_version),
    ciphertext: r.ciphertext,
    content_hash: r.content_hash,
  }));
  const nextCursor = rows.length ? Number(rows[rows.length - 1].id) : cursor;
  const [countRows] = await pool.query(
    "SELECT COUNT(*) AS remaining FROM sync_blobs WHERE account_id = ? AND id > ?",
    [accountId, nextCursor],
  );
  const hasMore = Number(countRows[0]?.remaining || 0) > 0;
  return { blobs, cursor: nextCursor, has_more: hasMore };
}

async function syncStatus(accountId) {
  const pool = getPool();
  const [blobRows] = await pool.query(
    "SELECT COUNT(*) AS total FROM sync_blobs WHERE account_id = ?",
    [accountId],
  );
  const [deviceRows] = await pool.query(
    "SELECT COUNT(*) AS total FROM sync_devices WHERE account_id = ?",
    [accountId],
  );
  return {
    ok: true,
    blob_count: Number(blobRows[0]?.total || 0),
    device_count: Number(deviceRows[0]?.total || 0),
  };
}

module.exports = { registerDevice, pushBlobs, pullBlobs, syncStatus };
