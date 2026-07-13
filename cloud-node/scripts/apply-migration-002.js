#!/usr/bin/env node
/**
 * Apply migration 002 (social sign-in tables) idempotently.
 * Usage: node scripts/apply-migration-002.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const fs = require("fs");
const path = require("path");
const { getPool } = require("../lib/db");

async function main() {
  const sqlPath = path.join(__dirname, "..", "migrations", "002_auth_identities.sql");
  const raw = fs.readFileSync(sqlPath, "utf8");
  const statements = raw
    .split(";")
    .map((s) => s.replace(/^--[^\n]*\n?/gm, "").trim())
    .filter(Boolean);

  const pool = getPool();
  for (const stmt of statements) {
    console.log("[migration-002]", stmt.split("\n")[0].slice(0, 72), "…");
    await pool.query(stmt);
  }

  const [cols] = await pool.query("SHOW COLUMNS FROM accounts LIKE 'password_hash'");
  const [tables] = await pool.query("SHOW TABLES");
  const names = tables.map((r) => Object.values(r)[0]);
  console.log("[migration-002] password_hash nullable:", cols[0]?.Null);
  console.log("[migration-002] auth_identities:", names.includes("auth_identities") ? "OK" : "MISSING");
  console.log("[migration-002] auth_exchange_codes:", names.includes("auth_exchange_codes") ? "OK" : "MISSING");
}

main().catch((e) => {
  console.error("[migration-002] failed:", e.message);
  process.exit(1);
});
