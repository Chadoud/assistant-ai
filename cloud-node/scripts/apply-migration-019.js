#!/usr/bin/env node
/**
 * Apply migration 019 — first_name / last_name on accounts (registration profile).
 *
 * Usage:
 *   node scripts/apply-migration-019.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { getPool } = require("../lib/db");

async function columnExists(pool, table, column) {
  const [rows] = await pool.query(`SHOW COLUMNS FROM ${table} LIKE ?`, [column]);
  return rows.length > 0;
}

async function main() {
  const pool = getPool();
  const columns = [
    { name: "first_name", ddl: "ADD COLUMN first_name VARCHAR(120) NULL AFTER email" },
    { name: "last_name", ddl: "ADD COLUMN last_name VARCHAR(120) NULL AFTER first_name" },
  ];

  for (const column of columns) {
    const exists = await columnExists(pool, "accounts", column.name);
    if (exists) {
      console.log(`[migration-019] accounts.${column.name} already present`);
      continue;
    }
    const stmt = `ALTER TABLE accounts ${column.ddl}`;
    console.log("[migration-019]", stmt);
    await pool.query(stmt);
  }

  const [first] = await pool.query("SHOW COLUMNS FROM accounts LIKE 'first_name'");
  const [last] = await pool.query("SHOW COLUMNS FROM accounts LIKE 'last_name'");
  console.log("[migration-019] first_name:", first.length ? "OK" : "MISSING");
  console.log("[migration-019] last_name:", last.length ? "OK" : "MISSING");
}

main().catch((e) => {
  console.error("[migration-019] failed:", e.message);
  process.exit(1);
});
