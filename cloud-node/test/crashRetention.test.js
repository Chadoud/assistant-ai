const test = require("node:test");
const assert = require("node:assert/strict");

const { pruneCrashReportsOlderThan, DEFAULT_CRASH_RETENTION_DAYS } = require("../lib/crashRetention");

test("pruneCrashReportsOlderThan deletes rows via pool", async () => {
  const calls = [];
  const pool = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return [{ affectedRows: 3 }];
    },
  };
  const removed = await pruneCrashReportsOlderThan(pool, 90);
  assert.equal(removed, 3);
  assert.match(calls[0].sql, /DELETE FROM crash_reports/);
  assert.deepEqual(calls[0].params, [90]);
});

test("DEFAULT_CRASH_RETENTION_DAYS is 90", () => {
  assert.equal(DEFAULT_CRASH_RETENTION_DAYS, 90);
});
