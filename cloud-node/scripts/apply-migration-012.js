#!/usr/bin/env node
/** Apply migration 012 — crash intelligence columns + v_crash_inbox_30d. */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { getPool } = require("../lib/db");
const { applySqlFileSafe } = require("./lib/applySqlFile");

function skipDuplicate(err) {
  const code = err && err.code;
  const msg = String(err && err.message ? err.message : err);
  return (
    code === "ER_DUP_FIELDNAME" ||
    code === "ER_DUP_KEYNAME" ||
    msg.includes("Duplicate column") ||
    msg.includes("Duplicate key name")
  );
}

async function main() {
  const pool = getPool();
  await applySqlFileSafe(pool, "migration-012", "012_crash_intelligence.sql", {
    skipOn: skipDuplicate,
  });
  console.log("[migration-012] crash intelligence applied");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
