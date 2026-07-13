#!/usr/bin/env node
/** Apply migration 020 — account names in v_account_activity for DataSuite. */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { getPool } = require("../lib/db");
const { applySqlFile } = require("./lib/applySqlFile");

async function main() {
  const pool = getPool();
  await applySqlFile(pool, "migration-020", "020_account_activity_names.sql");
  console.log("[migration-020] account activity names view applied");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
