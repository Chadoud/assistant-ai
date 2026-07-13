#!/usr/bin/env node
/** Apply migration 001 — ensure crash_reports in exo_app + copy from legacy DB. */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { getPool } = require("../lib/db");
const { applySqlFileSafe } = require("./lib/applySqlFile");

function legacyCopySkipped(err, stmt) {
  if (!stmt.toUpperCase().includes("INSERT INTO")) return false;
  return (
    err.code === "ER_NO_SUCH_TABLE" ||
    err.code === "ER_DBACCESS_DENIED_ERROR" ||
    err.code === "ER_TABLEACCESS_DENIED_ERROR" ||
    err.code === "ER_BAD_DB_ERROR"
  );
}

async function main() {
  const pool = getPool();
  await applySqlFileSafe(pool, "migration-001", "001_consolidate_crash_reports.sql", {
    skipOn: legacyCopySkipped,
  });
  console.log("[migration-001] crash_reports consolidated");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
