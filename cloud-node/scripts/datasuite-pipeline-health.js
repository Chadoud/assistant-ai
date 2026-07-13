#!/usr/bin/env node
/**
 * Check telemetry pipeline health (stdout). Exit 1 when alerts fire — for cron/Slack.
 *
 * Usage on api.exosites.ch:
 *   node scripts/datasuite-pipeline-health.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { getPool } = require("../lib/db");

const TELEMETRY_FILTER =
  "app_version <> 'verify' AND platform <> 'script' AND instance_id NOT LIKE 'verify-%'";

async function scalar(pool, sql) {
  const [rows] = await pool.query(sql);
  return rows[0] ? Number(Object.values(rows[0])[0]) : 0;
}

async function main() {
  const pool = getPool();
  const alerts = [];

  const events48h = await scalar(
    pool,
    `SELECT COUNT(*) AS n FROM telemetry_events
     WHERE created_at >= DATE_SUB(NOW(), INTERVAL 48 HOUR) AND ${TELEMETRY_FILTER}`,
  );
  const activeAccounts = await scalar(
    pool,
    "SELECT COUNT(*) AS n FROM accounts WHERE email NOT LIKE '%@example.com' AND email <> 'ga-verify@exosites.ch'",
  );

  if (activeAccounts > 0 && events48h === 0) {
    alerts.push(
      `No real telemetry events in 48h (${activeAccounts} non-test accounts exist). Check desktop opt-in and cloud sync.`,
    );
  }

  let silent = 0;
  let active = 0;
  let churned = 0;
  try {
    silent = await scalar(pool, "SELECT COUNT(*) AS n FROM v_device_activity WHERE status = 'silent'");
    active = await scalar(pool, "SELECT COUNT(*) AS n FROM v_device_activity WHERE status = 'active'");
    churned = await scalar(
      pool,
      "SELECT COUNT(*) AS n FROM v_device_activity WHERE status = 'likely_churned'",
    );
    const denom = active + silent + churned;
    if (denom >= 5 && active > 0 && (silent + churned) / denom > 0.5) {
      alerts.push(
        `Silent + likely stopped installs exceed 50% of tracked installs (${silent + churned}/${denom}).`,
      );
    }
  } catch {
    /* migration 009 not applied */
  }

  const lines = [
    "DataSuite pipeline health",
    `Real events (48h): ${events48h}`,
    `Non-test accounts: ${activeAccounts}`,
  ];
  if (active || silent || churned) {
    lines.push(`Installs — active: ${active}, silent: ${silent}, likely stopped: ${churned}`);
  }
  if (alerts.length === 0) {
    lines.push("", "OK — no alerts.");
    console.log(lines.join("\n"));
    process.exit(0);
  }
  lines.push("", "ALERTS:");
  for (const a of alerts) lines.push(`- ${a}`);
  console.log(lines.join("\n"));
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
