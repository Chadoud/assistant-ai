#!/usr/bin/env node
/** Apply migration 010 — account deletion audit table. */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { getPool } = require("../lib/db");
const { applySqlFile } = require("./lib/applySqlFile");

async function main() {
  const pool = getPool();
  await applySqlFile(pool, "migration-010", "010_accounts_deleted_audit.sql");
  console.log("[migration-010] accounts_deleted_at applied");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
