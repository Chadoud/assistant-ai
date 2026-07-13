/**
 * Upsert app_sessions from telemetry batches and mark crashes on sessions.
 */

/**
 * @param {import("mysql2/promise").Pool} pool
 * @param {string | null} accountId
 * @param {Array<{ session_id?: string | null, instance_id: string, app_version: string, platform: string }>} rows
 */
async function upsertSessionsFromTelemetry(pool, accountId, rows) {
  if (!rows.length) return;
  const first = rows[0];
  const sessionId = first.session_id;
  if (!sessionId || typeof sessionId !== "string" || sessionId.length < 8) return;

  await pool.query(
    `INSERT INTO app_sessions
      (session_id, instance_id, account_id, started_at, ended_at, app_version, platform)
     VALUES (?, ?, ?, NOW(6), NOW(6), ?, ?)
     ON DUPLICATE KEY UPDATE
       ended_at = NOW(6),
       account_id = COALESCE(VALUES(account_id), account_id),
       app_version = VALUES(app_version),
       platform = VALUES(platform)`,
    [
      sessionId.slice(0, 128),
      first.instance_id.slice(0, 128),
      accountId ? String(accountId).slice(0, 36) : null,
      (first.app_version || "unknown").slice(0, 64),
      (first.platform || "unknown").slice(0, 64),
    ],
  );
}

/**
 * @param {import("mysql2/promise").Pool} pool
 * @param {{ session_id?: string | null, instance_id?: string | null, account_id?: string | null, crash_id?: number | null }} fields
 */
async function markSessionCrashed(pool, fields) {
  const sessionId = fields.session_id;
  if (!sessionId) return;

  await pool.query(
    `UPDATE app_sessions
     SET crashed = 1, crash_id = COALESCE(?, crash_id), ended_at = NOW(6)
     WHERE session_id = ?`,
    [fields.crash_id ?? null, String(sessionId).slice(0, 128)],
  );

  const instanceId = fields.instance_id;
  if (!instanceId) return;

  await pool.query(
    `INSERT INTO app_sessions
      (session_id, instance_id, account_id, started_at, ended_at, app_version, platform, crashed, crash_id)
     VALUES (?, ?, ?, NOW(6), NOW(6), 'unknown', 'unknown', 1, ?)
     ON DUPLICATE KEY UPDATE crashed = 1, crash_id = COALESCE(VALUES(crash_id), crash_id), ended_at = NOW(6)`,
    [
      String(sessionId).slice(0, 128),
      String(instanceId).slice(0, 128),
      fields.account_id ? String(fields.account_id).slice(0, 36) : null,
      fields.crash_id ?? null,
    ],
  );
}

/**
 * Register a new crash signature for triage if unseen.
 * @param {import("mysql2/promise").Pool} pool
 * @param {string | null | undefined} signature
 */
async function ensureCrashTriageRow(pool, signature) {
  const sig = String(signature || "").slice(0, 64);
  if (!sig) return;
  await pool.query(
    `INSERT IGNORE INTO crash_triage (crash_signature, status) VALUES (?, 'new')`,
    [sig],
  );
}

module.exports = {
  upsertSessionsFromTelemetry,
  markSessionCrashed,
  ensureCrashTriageRow,
};
