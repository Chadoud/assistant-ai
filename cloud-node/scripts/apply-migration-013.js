#!/usr/bin/env node
/** Apply migration 013 — product intelligence views for DataSuite. */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { getPool } = require("../lib/db");
const { applySqlFile } = require("./lib/applySqlFile");

async function main() {
  const pool = getPool();
  await applySqlFile(pool, "migration-013", "013_product_intelligence.sql");
  console.log("[migration-013] product intelligence views applied");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
