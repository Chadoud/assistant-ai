#!/usr/bin/env node
/** Test MariaDB connectivity for datasuite read-only user (run on api.exosites.ch). */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const mysql = require("mysql2/promise");

async function main() {
  const user = process.env.DATASUITE_DB_USER || process.env.DATASUITE_RO_USER;
  const password =
    process.env.DATASUITE_DB_PASSWORD ||
    process.env.DATASUITE_RO_PASSWORD ||
    process.argv[2];
  if (!user || !password) {
    console.error(
      "Usage: DATASUITE_DB_USER=… DATASUITE_DB_PASSWORD=… node scripts/test-datasuite-db.js",
    );
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user,
    password,
    database: process.env.DB_NAME,
  });

  const [rows] = await conn.query("SELECT * FROM v_exec_summary_30d LIMIT 1");
  console.log("[datasuite-db] OK exec_summary", JSON.stringify(rows[0] ?? {}));

  for (const view of ["v_device_activity", "v_account_activity", "v_retention_weekly"]) {
    const [viewRows] = await conn.query(`SELECT COUNT(*) AS n FROM ${view}`);
    console.log(`[datasuite-db] OK ${view}`, viewRows[0]?.n ?? 0);
  }
  await conn.end();
  process.exit(0);
}

main().catch((e) => {
  console.error("[datasuite-db] FAIL", e.message);
  process.exit(1);
});
