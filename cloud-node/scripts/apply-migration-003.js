#!/usr/bin/env node
/**
 * Apply migration 003 (trial_ends_at on accounts) idempotently.
 *
 * Usage:
 *   node scripts/apply-migration-003.js
 *
 * One-time fix for accounts backfilled with created_at+14d (already expired):
 *   TRIAL_GRANDFATHER_EXPIRED=1 node scripts/apply-migration-003.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const fs = require("fs");
const path = require("path");
const config = require("../lib/config");
const { getPool } = require("../lib/db");

async function columnExists(pool, table, column) {
  const [rows] = await pool.query(`SHOW COLUMNS FROM ${table} LIKE ?`, [column]);
  return rows.length > 0;
}

async function backfillMissingTrials(pool) {
  const [result] = await pool.query(
    "UPDATE accounts SET trial_ends_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? DAY) WHERE trial_ends_at IS NULL",
    [config.freeTrialDays],
  );
  console.log("[migration-003] backfilled NULL trial_ends_at:", result.affectedRows ?? 0);
}

async function grandfatherExpiredTrials(pool) {
  const [result] = await pool.query(
    "UPDATE accounts SET trial_ends_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? DAY) WHERE trial_ends_at < UTC_TIMESTAMP()",
    [config.freeTrialDays],
  );
  console.log("[migration-003] grandfathered expired trials:", result.affectedRows ?? 0);
}

async function main() {
  const pool = getPool();
  const hasColumn = await columnExists(pool, "accounts", "trial_ends_at");
  if (!hasColumn) {
    const sqlPath = path.join(__dirname, "..", "migrations", "003_trial_ends_at.sql");
    const raw = fs.readFileSync(sqlPath, "utf8");
    const statements = raw
      .split(";")
      .map((s) => s.replace(/^--[^\n]*\n?/gm, "").trim())
      .filter(Boolean);
    for (const stmt of statements) {
      console.log("[migration-003]", stmt.split("\n")[0].slice(0, 72), "…");
      await pool.query(stmt);
    }
  } else {
    console.log("[migration-003] trial_ends_at column present");
    await backfillMissingTrials(pool);
  }

  if (process.env.TRIAL_GRANDFATHER_EXPIRED === "1") {
    await grandfatherExpiredTrials(pool);
  }

  const [cols] = await pool.query("SHOW COLUMNS FROM accounts LIKE 'trial_ends_at'");
  console.log("[migration-003] trial_ends_at:", cols[0] ? "OK" : "MISSING");
  console.log("[migration-003] FREE_TRIAL_DAYS:", config.freeTrialDays);
}

main().catch((e) => {
  console.error("[migration-003] failed:", e.message);
  process.exit(1);
});
