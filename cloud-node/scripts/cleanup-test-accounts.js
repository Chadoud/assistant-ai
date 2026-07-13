#!/usr/bin/env node
/**
 * Delete throwaway accounts created by verify / GA smoke scripts.
 *
 * Usage:
 *   node scripts/cleanup-test-accounts.js              # dry run (count only)
 *   CONFIRM=1 node scripts/cleanup-test-accounts.js    # delete matched rows
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { getPool } = require("../lib/db");
const { cleanupTestAccounts, listTrashAccountIds } = require("../lib/testAccountCleanup");

async function main() {
  const confirm = process.env.CONFIRM === "1";
  const pool = getPool();
  const ids = await listTrashAccountIds(pool);

  if (ids.length === 0) {
    console.log(JSON.stringify({ ok: true, matched: 0, deleted: 0, dryRun: !confirm }));
    await pool.end();
    return;
  }

  if (!confirm) {
    const [sample] = await pool.execute(
      `SELECT email, created_at FROM accounts
       WHERE id IN (${ids.slice(0, 5).map(() => "?").join(", ") || "''"})
       ORDER BY created_at DESC`,
      ids.slice(0, 5),
    );
    console.log(
      JSON.stringify(
        {
          ok: true,
          dryRun: true,
          matched: ids.length,
          sample,
          hint: "Re-run with CONFIRM=1 to delete",
        },
        null,
        2,
      ),
    );
    await pool.end();
    return;
  }

  const result = await cleanupTestAccounts({ dryRun: false });
  const [remaining] = await pool.execute("SELECT COUNT(*) AS n FROM accounts");
  console.log(JSON.stringify({ ok: true, ...result, accountsRemaining: remaining[0]?.n ?? null }));
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
