#!/usr/bin/env node
/**
 * Apply SELECT grants for datasuite read-only MariaDB user (run once on api host).
 * Prerequisite: create user YOUR_IK_ID_datasuite in Infomaniak → Bases de données.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { getPool } = require("../lib/db");

const RO_USER = process.env.DATASUITE_DB_USER || process.env.DATASUITE_RO_USER;
const DB_NAME = process.env.DB_NAME;
if (!RO_USER || !DB_NAME) {
  console.error(
    "Set DATASUITE_DB_USER (or DATASUITE_RO_USER) and DB_NAME in cloud-node/.env before applying grants.",
  );
  process.exit(1);
}

const OBJECTS = [
  "telemetry_events",
  "product_feedback",
  "crash_reports",
  "accounts",
  "v_daily_event_counts",
  "v_daily_active_devices",
  "v_feedback_inbox",
  "v_crash_daily",
  "v_sort_funnel_7d",
  "v_exec_summary_30d",
  "v_funnel_conversion_7d",
  "v_top_crash_signatures_30d",
  "v_release_health_14d",
  "v_feedback_weekly_12w",
  "v_signed_in_vs_anonymous_daily",
  "v_event_volume_daily",
  "v_feedback_submissions_weekly",
  "v_release_starts_14d",
  "v_device_activity",
  "v_account_activity",
  "v_retention_weekly",
  "v_crash_inbox_30d",
  "v_feature_engagement_30d",
  "v_assistant_ops_30d",
  "v_assistant_tools_30d",
  "v_crash_by_feature_30d",
  "v_integration_health_30d",
  "v_messaging_health_30d",
  "app_sessions",
  "crash_triage",
  "v_install_health_30d",
  "v_account_health_30d",
];

/** Tables where DataSuite may UPDATE (triage workflow only). */
const WRITE_TABLES = ["crash_triage"];

async function main() {
  const pool = getPool();
  for (const host of ["localhost", "%"]) {
    for (const object of OBJECTS) {
      const sql = `GRANT SELECT ON \`${DB_NAME}\`.\`${object}\` TO '${RO_USER}'@'${host}'`;
      try {
        await pool.query(sql);
        console.log("[datasuite-grants]", object, host);
      } catch (e) {
        console.warn("[datasuite-grants] skip", object, host, "-", e.message);
      }
    }
    for (const table of WRITE_TABLES) {
      const sql = `GRANT SELECT, INSERT, UPDATE ON \`${DB_NAME}\`.\`${table}\` TO '${RO_USER}'@'${host}'`;
      try {
        await pool.query(sql);
        console.log("[datasuite-grants] write", table, host);
      } catch (e) {
        console.warn("[datasuite-grants] write skip", table, host, "-", e.message);
      }
    }
  }
  await pool.query("FLUSH PRIVILEGES").catch((e) => {
    console.warn("[datasuite-grants] FLUSH PRIVILEGES skipped:", e.message);
  });
  console.log("[datasuite-grants] done — if grants failed, run SQL in phpMyAdmin as admin");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
