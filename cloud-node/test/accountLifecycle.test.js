const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

test("deleteAccount purges telemetry and records deletion audit", async () => {
  const accountId = "acc-test-001";
  const executed = [];

  const conn = {
    async beginTransaction() {
      executed.push("begin");
    },
    async commit() {
      executed.push("commit");
    },
    async rollback() {
      executed.push("rollback");
    },
    async execute(sql, params = []) {
      executed.push({ sql: sql.replace(/\s+/g, " ").trim(), params });
      return [{ affectedRows: 1 }];
    },
    release() {},
  };

  const pool = {
    async getConnection() {
      return conn;
    },
  };

  delete require.cache[require.resolve("../lib/db")];
  delete require.cache[require.resolve("../lib/accountLifecycle")];
  require("../lib/db").getPool = () => pool;

  const { deleteAccount } = require("../lib/accountLifecycle");
  await deleteAccount(accountId);

  const telemetryDelete = executed.find(
    (e) => typeof e === "object" && /delete from telemetry_events/i.test(e.sql),
  );
  assert.ok(telemetryDelete);
  assert.deepEqual(telemetryDelete.params, [accountId]);

  const feedbackDelete = executed.find(
    (e) => typeof e === "object" && /delete from product_feedback/i.test(e.sql),
  );
  assert.ok(feedbackDelete);

  const crashDelete = executed.find(
    (e) => typeof e === "object" && /delete from crash_reports/i.test(e.sql),
  );
  assert.ok(crashDelete);
  assert.deepEqual(crashDelete.params, [accountId]);

  const sessionsDelete = executed.find(
    (e) => typeof e === "object" && /delete from app_sessions/i.test(e.sql),
  );
  assert.ok(sessionsDelete);
  assert.deepEqual(sessionsDelete.params, [accountId]);

  const auditInsert = executed.find(
    (e) => typeof e === "object" && /insert into accounts_deleted_at/i.test(e.sql),
  );
  assert.ok(auditInsert);
  assert.equal(
    auditInsert.params[0],
    crypto.createHash("sha256").update(accountId).digest("hex"),
  );
  assert.ok(executed.includes("commit"));
});
