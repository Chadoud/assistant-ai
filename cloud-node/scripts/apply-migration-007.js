#!/usr/bin/env node
/** Apply migration 007 — DataSuite insight views. */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { getPool } = require("../lib/db");
const { applySqlFile } = require("./lib/applySqlFile");

async function main() {
  const pool = getPool();
  await applySqlFile(pool, "migration-007", "007_datasuite_insights.sql");
  console.log("[migration-007] DataSuite insight views applied");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
