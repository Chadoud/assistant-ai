const fs = require("fs");
const path = require("path");

/**
 * @param {import("mysql2/promise").Pool} pool
 * @param {string} label
 * @param {string} filename migration file under migrations/
 */
async function applySqlFile(pool, label, filename) {
  const sqlPath = path.join(__dirname, "..", "..", "migrations", filename);
  const raw = fs.readFileSync(sqlPath, "utf8");
  const withoutLineComments = raw.replace(/^--[^\n]*\n?/gm, "");
  const statements = withoutLineComments
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const stmt of statements) {
    console.log(`[${label}]`, stmt.split("\n")[0].slice(0, 72), "…");
    await pool.query(stmt);
  }
}

/**
 * @param {import("mysql2/promise").Pool} pool
 * @param {string} label
 * @param {string} filename
 * @param {{ skipOn?: (err: Error, stmt: string) => boolean }} [opts]
 */
async function applySqlFileSafe(pool, label, filename, opts = {}) {
  const sqlPath = path.join(__dirname, "..", "..", "migrations", filename);
  const raw = fs.readFileSync(sqlPath, "utf8");
  const withoutLineComments = raw.replace(/^--[^\n]*\n?/gm, "");
  const statements = withoutLineComments
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const stmt of statements) {
    console.log(`[${label}]`, stmt.split("\n")[0].slice(0, 72), "…");
    try {
      await pool.query(stmt);
    } catch (e) {
      if (opts.skipOn?.(e, stmt)) {
        console.warn(`[${label}] skipped:`, e.message);
        continue;
      }
      throw e;
    }
  }
}

module.exports = { applySqlFile, applySqlFileSafe };
