#!/usr/bin/env node
/** Apply migration 014 — app_sessions + crash_triage + health views. */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { getPool } = require("../lib/db");
const { applySqlFileSafe } = require("./lib/applySqlFile");

function skipDuplicate(err) {
  const code = err && err.code;
  const msg = String(err && err.message ? err.message : err);
  return code === "ER_TABLE_EXISTS_ERROR" || msg.includes("already exists");
}

async function main() {
  const pool = getPool();
  await applySqlFileSafe(pool, "migration-014", "014_sessions_and_triage.sql", {
    skipOn: skipDuplicate,
  });
  console.log("[migration-014] sessions and triage applied");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
