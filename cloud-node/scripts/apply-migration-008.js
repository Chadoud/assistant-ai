#!/usr/bin/env node
/** Apply migration 008 — WhatsApp Business webhook tables. */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { getPool } = require("../lib/db");
const { applySqlFile } = require("./lib/applySqlFile");

async function main() {
  const pool = getPool();
  await applySqlFile(pool, "migration-008", "008_whatsapp_webhooks.sql");
  console.log("[migration-008] WhatsApp webhook tables applied");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
