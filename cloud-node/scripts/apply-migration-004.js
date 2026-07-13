#!/usr/bin/env node
/** Apply migration 004 — GO SYNC relay tables. */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { getPool } = require("../lib/db");
const { applySqlFile } = require("./lib/applySqlFile");

async function main() {
  const pool = getPool();
  await applySqlFile(pool, "migration-004", "004_sync_relay.sql");
  console.log("[migration-004] sync relay tables applied");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
