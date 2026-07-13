#!/usr/bin/env node
/**
 * Ops cron: delete crash_reports rows older than retention (default 180 days).
 *
 * Usage:
 *   node cloud-node/scripts/prune-crash-reports.js [days]
 */
const { getPool } = require("../lib/db");
const { pruneCrashReportsOlderThan } = require("../lib/crashRetention");

async function main() {
  const days = Number(process.argv[2] || 180);
  const pool = getPool();
  const removed = await pruneCrashReportsOlderThan(pool, days);
  console.log(JSON.stringify({ ok: true, removed, days }));
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
