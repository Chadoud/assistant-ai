#!/usr/bin/env node
/**
 * Print recent enriched crashes for triage (CLI / SSH on api host).
 *
 * Usage:
 *   node scripts/list-recent-crashes.js [limit]
 *   node scripts/list-recent-crashes.js 20 whatsapp
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { getPool } = require("../lib/db");
const { crashFilterSql } = require("../lib/crashFilter");

async function main() {
  const limit = Math.max(1, Math.min(100, Number(process.argv[2] || 15)));
  const filter = (process.argv[3] || "").trim().toLowerCase();
  const pool = getPool();

  let sql = `SELECT id, created_at, app_version, source, active_feature, intent_bucket,
                    tool_name, crash_signature, LEFT(error_message, 120) AS preview
             FROM crash_reports
             WHERE 1=1${crashFilterSql()}`;
  const params = [];
  if (filter) {
    sql += ` AND (
      LOWER(COALESCE(intent_bucket, '')) LIKE ?
      OR LOWER(COALESCE(active_feature, '')) LIKE ?
      OR LOWER(COALESCE(tool_name, '')) LIKE ?
      OR LOWER(COALESCE(error_message, '')) LIKE ?
    )`;
    const like = `%${filter}%`;
    params.push(like, like, like, like);
  }
  sql += " ORDER BY created_at DESC LIMIT ?";
  params.push(limit);

  const [rows] = await pool.query(sql, params);
  if (!rows.length) {
    console.log(filter ? `No crashes matching "${filter}".` : "No crashes found.");
    process.exit(0);
  }

  console.log(`Recent crashes (limit ${limit}${filter ? `, filter="${filter}"` : ""}):\n`);
  for (const row of rows) {
    console.log(
      `#${row.id} ${row.created_at} v${row.app_version} [${row.source}]`,
    );
    console.log(
      `  feature=${row.active_feature ?? "—"} intent=${row.intent_bucket ?? "—"} tool=${row.tool_name ?? "—"}`,
    );
    console.log(`  sig=${row.crash_signature ?? "—"}`);
    console.log(`  ${row.preview ?? ""}\n`);
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
