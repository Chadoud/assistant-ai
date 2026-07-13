#!/usr/bin/env node
/**
 * Ops cron: prune old telemetry events and product feedback.
 *
 * Usage:
 *   node cloud-node/scripts/prune-product-analytics.js [telemetry_days] [feedback_days]
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { getPool } = require("../lib/db");
const {
  pruneTelemetryOlderThan,
  pruneFeedbackOlderThan,
} = require("../lib/productAnalyticsRetention");

async function main() {
  const telemetryDays = Number(process.argv[2] || 90);
  const feedbackDays = Number(process.argv[3] || 365);
  const pool = getPool();
  const telemetryRemoved = await pruneTelemetryOlderThan(pool, telemetryDays);
  const feedbackRemoved = await pruneFeedbackOlderThan(pool, feedbackDays);
  console.log(
    JSON.stringify({
      ok: true,
      telemetry_removed: telemetryRemoved,
      feedback_removed: feedbackRemoved,
      telemetry_days: telemetryDays,
      feedback_days: feedbackDays,
    }),
  );
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
