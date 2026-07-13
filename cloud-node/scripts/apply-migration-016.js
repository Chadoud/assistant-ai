#!/usr/bin/env node
/** Apply migration 016 — normalize collations + recreate activity views. */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { getPool } = require("../lib/db");
const { applySqlFile } = require("./lib/applySqlFile");

async function main() {
  const pool = getPool();
  await applySqlFile(pool, "migration-016", "016_fix_activity_collation.sql");
  console.log("[migration-016] activity collation fix applied");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
