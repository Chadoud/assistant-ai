#!/usr/bin/env node
/**
 * Weekly executive digest — metrics + top product priorities (stdout for cron/Slack).
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { getPool } = require("../lib/db");
const { crashFilterSql } = require("../lib/crashFilter");

const TELEMETRY_FILTER =
  "app_version <> 'verify' AND platform <> 'script' AND instance_id NOT LIKE 'verify-%'";

async function scalar(pool, sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows[0] ? Object.values(rows[0])[0] : 0;
}

async function rows(pool, sql, params = []) {
  const [result] = await pool.query(sql, params);
  return result;
}

async function main() {
  const pool = getPool();
  const filter = TELEMETRY_FILTER;

  const devices = await scalar(
    pool,
    `SELECT COUNT(DISTINCT instance_id) AS n FROM telemetry_events
     WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) AND ${filter}`,
  );
  const crashes = await scalar(
    pool,
    `SELECT COUNT(*) AS n FROM crash_reports
     WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)${crashFilterSql()}`,
  );
  const turnsFailed = await scalar(
    pool,
    `SELECT COUNT(*) AS n FROM telemetry_events
     WHERE event_name = 'assistant_turn_failed' AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) AND ${filter}`,
  );
  const providerErrors = await scalar(
    pool,
    `SELECT COUNT(*) AS n FROM telemetry_events
     WHERE event_name = 'provider_error' AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) AND ${filter}`,
  );
  const jobsStarted = await scalar(
    pool,
    `SELECT COUNT(*) AS n FROM telemetry_events
     WHERE event_name = 'job_started' AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) AND ${filter}`,
  );
  const jobsCompleted = await scalar(
    pool,
    `SELECT COUNT(*) AS n FROM telemetry_events
     WHERE event_name = 'job_completed' AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) AND ${filter}`,
  );

  let crashedSessions = 0;
  let totalSessions = 0;
  try {
    crashedSessions = await scalar(
      pool,
      "SELECT COUNT(*) AS n FROM app_sessions WHERE crashed = 1 AND started_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)",
    );
    totalSessions = await scalar(
      pool,
      "SELECT COUNT(*) AS n FROM app_sessions WHERE started_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)",
    );
  } catch {
    /* migration 014 optional */
  }

  const topSignatures = await rows(
    pool,
    `SELECT LEFT(error_message, 80) AS sig, COUNT(*) AS n
     FROM crash_reports
     WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)${crashFilterSql()}
     GROUP BY LEFT(error_message, 80)
     ORDER BY n DESC LIMIT 3`,
  );

  const lines = [
    "Exosites weekly product digest (7 days)",
    "========================================",
    "",
    "Usage",
    `  Active installs: ${devices}`,
    `  Sorts: ${jobsCompleted} finished / ${jobsStarted} started`,
    "",
    "Reliability",
    `  Crash reports: ${crashes}`,
  ];

  if (totalSessions > 0) {
    const rate = Math.round((crashedSessions / totalSessions) * 100);
    lines.push(`  Crash sessions: ${crashedSessions} / ${totalSessions} (${rate}%)`);
  }

  lines.push(
    `  Assistant turn failures: ${turnsFailed}`,
    `  LLM provider errors: ${providerErrors}`,
    "",
  );

  if (topSignatures.length) {
    lines.push("Top crash themes:");
    for (const row of topSignatures) {
      lines.push(`  - (${row.n}x) ${row.sig}`);
    }
    lines.push("");
  }

  lines.push(
    "Actions this week:",
    "  1. Open DataSuite → Product tab for ranked priorities",
    "  2. Quality → crash inbox for repro details",
    "  3. Fix top signature before next desktop release",
    "",
    "https://datasuite.exosites.ch",
  );

  console.log(lines.join("\n"));
  process.exit(crashes > 0 || turnsFailed > 5 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
