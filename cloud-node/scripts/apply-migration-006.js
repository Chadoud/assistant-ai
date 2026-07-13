#!/usr/bin/env node
/** Apply migration 006 — DataSuite dashboard views (read-only PHP consumer). */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { getPool } = require("../lib/db");
const { applySqlFile } = require("./lib/applySqlFile");

async function main() {
  const pool = getPool();
  await applySqlFile(pool, "migration-006", "006_datasuite_views.sql");
  console.log("[migration-006] DataSuite views applied");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
