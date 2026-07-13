#!/usr/bin/env node
/** Apply migration 005 — product analytics tables + dashboard views. */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { getPool } = require("../lib/db");
const { applySqlFile } = require("./lib/applySqlFile");

async function main() {
  const pool = getPool();
  await applySqlFile(pool, "migration-005", "005_product_analytics.sql");
  await applySqlFile(pool, "migration-005", "005_ensure_crash_reports.sql");
  await applySqlFile(pool, "migration-005", "005_dashboard_views.sql");
  console.log("[migration-005] product analytics applied");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
