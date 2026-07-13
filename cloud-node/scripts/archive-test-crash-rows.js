#!/usr/bin/env node
/**
 * Archive pytest/verify crash rows so they stop polluting triage and raw SQL counts.
 *
 * Default: dry-run (lists matching rows). Pass --apply to mutate in place.
 *
 * Usage:
 *   node scripts/archive-test-crash-rows.js
 *   node scripts/archive-test-crash-rows.js --apply
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { getPool } = require("../lib/db");
const { CRASH_TEST_ROW_PREDICATE } = require("../lib/crashFilter");

async function main() {
  const apply = process.argv.includes("--apply");
  const pool = getPool();

  const [rows] = await pool.query(
    `SELECT id, created_at, app_version, source, LEFT(error_message, 100) AS preview
     FROM crash_reports
     WHERE ${CRASH_TEST_ROW_PREDICATE}
       AND error_message NOT LIKE '[archived_test]%'
     ORDER BY created_at DESC`,
  );

  if (!rows.length) {
    console.log("[archive-test-crash-rows] No test-pattern crash rows found.");
    await pool.end();
    return;
  }

  console.log(`[archive-test-crash-rows] ${rows.length} row(s) match test filter:`);
  for (const row of rows) {
    console.log(`  #${row.id} ${row.created_at} v${row.app_version} [${row.source}] ${row.preview}`);
  }

  if (!apply) {
    console.log("\nDry run — pass --apply to prefix rows with [archived_test] and tag source.");
    await pool.end();
    return;
  }

  const [result] = await pool.query(
    `UPDATE crash_reports
     SET source = CONCAT(source, '_archived_test'),
         error_message = CONCAT('[archived_test] ', error_message)
     WHERE ${CRASH_TEST_ROW_PREDICATE}
       AND error_message NOT LIKE '[archived_test]%'`,
  );
  console.log(`\n[archive-test-crash-rows] Updated ${result.affectedRows} row(s).`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
