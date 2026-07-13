const test = require("node:test");
const assert = require("node:assert/strict");
const {
  upsertSessionsFromTelemetry,
  markSessionCrashed,
  ensureCrashTriageRow,
} = require("../lib/appSessions");

test("upsertSessionsFromTelemetry inserts session row", async () => {
  const queries = [];
  const pool = {
    async query(sql, params) {
      queries.push({ sql, params });
      return [{ affectedRows: 1 }];
    },
  };
  await upsertSessionsFromTelemetry(pool, "acct-1", [
    {
      session_id: "sess-test-12345678",
      instance_id: "inst-test-12345678",
      app_version: "1.0.0",
      platform: "electron",
    },
  ]);
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /INSERT INTO app_sessions/);
  assert.equal(queries[0].params[0], "sess-test-12345678");
});

test("markSessionCrashed updates session", async () => {
  const queries = [];
  const pool = {
    async query(sql, params) {
      queries.push({ sql, params });
      return [{ affectedRows: 1 }];
    },
  };
  await markSessionCrashed(pool, {
    session_id: "sess-crash-12345678",
    instance_id: "inst-test-12345678",
    crash_id: 42,
  });
  assert.ok(queries.length >= 1);
  assert.match(queries[0].sql, /UPDATE app_sessions/);
});

test("ensureCrashTriageRow inserts ignore", async () => {
  const queries = [];
  const pool = {
    async query(sql, params) {
      queries.push({ sql, params });
      return [{ affectedRows: 1 }];
    },
  };
  await ensureCrashTriageRow(pool, "abc123signature");
  assert.match(queries[0].sql, /INSERT IGNORE INTO crash_triage/);
});
