#!/usr/bin/env node
/**
 * Apply migration 021 — product_admins allowlist + seed chadykassab@gmail.com.
 *
 * Usage:
 *   node scripts/apply-migration-021.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { getPool } = require("../lib/db");
const { applySqlFileSafe } = require("./lib/applySqlFile");

async function tableExists(pool, table) {
  const [rows] = await pool.query("SHOW TABLES LIKE ?", [table]);
  return rows.length > 0;
}

async function main() {
  const pool = getPool();
  await applySqlFileSafe(pool, "migration-021", "021_product_admins.sql");

  const exists = await tableExists(pool, "product_admins");
  console.log("[migration-021] product_admins table:", exists ? "OK" : "MISSING");

  const [seeded] = await pool.query(
    `SELECT pa.account_id, pa.email
     FROM product_admins pa
     INNER JOIN accounts a ON a.id = pa.account_id
     WHERE a.email = ?
     LIMIT 1`,
    ["chadykassab@gmail.com"],
  );
  if (seeded.length) {
    console.log("[migration-021] admin seeded:", seeded[0].email, seeded[0].account_id);
  } else {
    console.warn(
      "[migration-021] chadykassab@gmail.com not in product_admins — account may not exist yet",
    );
  }
}

main().catch((e) => {
  console.error("[migration-021] failed:", e.message);
  process.exit(1);
});
