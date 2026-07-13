/** In-memory MySQL pool mock for sync relay unit tests. */

function createSyncMockPool() {
  /** @type {Map<string, object>} */
  const blobs = new Map();
  /** @type {Map<string, object>} */
  const devices = new Map();
  /** @type {Map<string, number>} */
  const cursors = new Map();
  let blobSeq = 0;

  function blobKey(accountId, collection, recordId) {
    return `${accountId}:${collection}:${recordId}`;
  }

  async function query(sql, params = []) {
    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();

    if (normalized.startsWith("insert into sync_devices")) {
      const [id, accountId, name, platform, pushToken] = params;
      devices.set(id, { id, accountId, name, platform, pushToken });
      return [{ affectedRows: 1 }];
    }

    if (normalized.startsWith("insert into sync_blobs")) {
      const [
        accountId,
        collection,
        recordId,
        deviceId,
        logicalClock,
        updatedAt,
        deleted,
        schemaVersion,
        ciphertext,
        contentHash,
      ] = params;
      const key = blobKey(accountId, collection, recordId);
      const existing = blobs.get(key);
      if (existing && Number(logicalClock) < Number(existing.logical_clock)) {
        return [{ affectedRows: 0 }];
      }
      blobSeq += 1;
      blobs.set(key, {
        id: blobSeq,
        account_id: accountId,
        collection,
        record_id: recordId,
        device_id: deviceId,
        logical_clock: Number(logicalClock),
        updated_at: updatedAt,
        deleted: Boolean(deleted),
        schema_version: Number(schemaVersion),
        ciphertext,
        content_hash: contentHash,
      });
      return [{ affectedRows: 1 }];
    }

    if (normalized.includes("select coalesce(max(id)") && normalized.includes("from sync_blobs")) {
      const [accountId] = params;
      let maxId = 0;
      for (const row of blobs.values()) {
        if (row.account_id === accountId) maxId = Math.max(maxId, row.id);
      }
      return [[{ max_blob_id: maxId }]];
    }

    if (normalized.startsWith("insert into sync_cursors")) {
      const [accountId, cursor] = params;
      const prev = cursors.get(accountId) || 0;
      cursors.set(accountId, Math.max(prev, Number(cursor)));
      return [{ affectedRows: 1 }];
    }

    if (normalized.includes("count(*) as remaining")) {
      const [accountId, nextCursor] = params;
      const remaining = [...blobs.values()].filter(
        (b) => b.account_id === accountId && b.id > nextCursor,
      ).length;
      return [[{ remaining }]];
    }

    if (normalized.includes("from sync_blobs") && normalized.includes("id > ?") && normalized.includes("limit ?")) {
      const [accountId, cursor, limit] = params;
      const rows = [...blobs.values()]
        .filter((b) => b.account_id === accountId && b.id > cursor)
        .sort((a, b) => a.id - b.id)
        .slice(0, limit);
      return [rows];
    }

    if (normalized.includes("count(*) as total from sync_blobs")) {
      const [accountId] = params;
      const total = [...blobs.values()].filter((b) => b.account_id === accountId).length;
      return [[{ total }]];
    }

    if (normalized.includes("count(*) as total from sync_devices")) {
      const [accountId] = params;
      const total = [...devices.values()].filter((d) => d.accountId === accountId).length;
      return [[{ total }]];
    }

    throw new Error(`mockPool: unhandled query: ${sql.slice(0, 80)}`);
  }

  return { query, blobs, devices, cursors };
}

module.exports = { createSyncMockPool };
