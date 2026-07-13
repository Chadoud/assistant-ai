#!/usr/bin/env node
/** Apply migration 011 — refresh_token_jti for refresh-token rotation. */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { getPool } = require("../lib/db");
const { applySqlFile } = require("./lib/applySqlFile");

async function main() {
  const pool = getPool();
  await applySqlFile(pool, "migration-011", "011_refresh_token_jti.sql");
  console.log("[migration-011] refresh_token_jti applied");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
