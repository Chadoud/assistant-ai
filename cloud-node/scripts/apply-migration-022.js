#!/usr/bin/env node
/**
 * Apply migration 022 — filtered crash analytics views.
 *
 * Usage:
 *   node scripts/apply-migration-022.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { getPool } = require("../lib/db");
const { applySqlFileSafe } = require("./lib/applySqlFile");

async function main() {
  const pool = getPool();
  await applySqlFileSafe(pool, "migration-022", "022_crash_filter_views.sql");

  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n
     FROM crash_reports
     WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       AND app_version NOT IN ('verify', '0.0.0-test')
       AND source NOT IN ('script', 'selftest')`,
  );
  console.log("[migration-022] filtered crash rows (30d, partial check):", rows[0]?.n ?? 0);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
