#!/usr/bin/env node
/**
 * Exit 1 when a new crash signature appeared in the last 24h (for cron / Slack).
 *
 * Usage:
 *   node scripts/crash-alert-new-signature.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { getPool } = require("../lib/db");
const { crashFilterSql } = require("../lib/crashFilter");

async function main() {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT t.crash_signature, t.status, COUNT(c.id) AS crashes_24h, MAX(c.created_at) AS last_seen
     FROM crash_triage t
     INNER JOIN crash_reports c ON c.crash_signature = t.crash_signature
     WHERE c.created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)${crashFilterSql("c")}
       AND t.created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)
     GROUP BY t.crash_signature, t.status
     ORDER BY crashes_24h DESC
     LIMIT 10`,
  );

  if (!rows.length) {
    console.log("No new crash signatures in the last 24h.");
    process.exit(0);
  }

  console.log("ALERT: new crash signature(s) in last 24h");
  for (const row of rows) {
    console.log(
      `- ${row.crash_signature} (${row.crashes_24h} crash(es), status=${row.status}, last=${row.last_seen})`,
    );
  }
  console.log("Dashboard: https://datasuite.exosites.ch → Quality");
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
