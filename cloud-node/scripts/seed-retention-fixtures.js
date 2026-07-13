#!/usr/bin/env node
/**
 * Seed staging retention fixtures (non-production instance ids).
 * Requires CONFIRM=1. Never run against production without understanding impact.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { getPool } = require("../lib/db");
const { insertTelemetryEvents } = require("../lib/telemetryStore");

const PREFIX = "staging-retention-";

async function main() {
  if (process.env.CONFIRM !== "1") {
    console.error("Set CONFIRM=1 to insert staging retention fixtures.");
    process.exit(1);
  }

  const pool = getPool();
  const now = Date.now();
  const dayMs = 86400000;
  const fixtures = [
    { id: `${PREFIX}active`, daysAgo: 1, events: ["app_started", "job_started"] },
    { id: `${PREFIX}silent`, daysAgo: 14, events: ["app_started"] },
    { id: `${PREFIX}churned`, daysAgo: 45, events: ["app_started", "job_completed"] },
  ];

  for (const fx of fixtures) {
    const clientTs = now - fx.daysAgo * dayMs;
    const rows = fx.events.map((name) => ({
      instance_id: fx.id,
      app_version: "staging-fixture",
      platform: "script",
      locale: "en",
      event_name: name,
      event_props: null,
      client_ts_ms: clientTs,
    }));
    await insertTelemetryEvents(pool, null, rows);
    console.log("[seed-retention]", fx.id, fx.daysAgo, "days ago");
  }

  console.log("[seed-retention] done — excluded from DataSuite via TelemetryFilter (platform=script)");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
