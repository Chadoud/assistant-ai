#!/usr/bin/env node
/** Apply migration 017 — sort health + blocker views for DataSuite. */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { getPool } = require("../lib/db");
const { applySqlFile } = require("./lib/applySqlFile");

async function main() {
  const pool = getPool();
  await applySqlFile(pool, "migration-017", "017_granular_analytics_views.sql");
  console.log("[migration-017] granular analytics views applied");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
