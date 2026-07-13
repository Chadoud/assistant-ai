#!/usr/bin/env node
/** Apply migration 018 — review funnel, setup milestones, assistant intent views. */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { getPool } = require("../lib/db");
const { applySqlFile } = require("./lib/applySqlFile");

async function main() {
  const pool = getPool();
  await applySqlFile(pool, "migration-018", "018_review_setup_intent_views.sql");
  console.log("[migration-018] review/setup/intent views applied");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
