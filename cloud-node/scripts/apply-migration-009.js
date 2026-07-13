#!/usr/bin/env node
/** Apply migration 009 — DataSuite activity & retention views. */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { getPool } = require("../lib/db");
const { applySqlFile } = require("./lib/applySqlFile");

async function main() {
  const pool = getPool();
  await applySqlFile(pool, "migration-009", "009_datasuite_activity.sql");
  console.log("[migration-009] DataSuite activity views applied");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
