const test = require("node:test");
const assert = require("node:assert/strict");
const { insertTelemetryEvents } = require("../lib/telemetryStore");

test("insertTelemetryEvents builds a single batch INSERT", async () => {
  /** @type {{ sql: string, params: unknown[] } | null} */
  let captured = null;
  const pool = {
    async query(sql, params) {
      captured = { sql, params };
      return [{ affectedRows: 2 }];
    },
  };

  await insertTelemetryEvents(pool, "acct-1", [
    {
      instance_id: "inst-1",
      session_id: "sess-1",
      app_version: "1.0.0",
      platform: "electron",
      locale: "en",
      event_name: "app_started",
      event_props: null,
      client_ts_ms: 100,
    },
    {
      instance_id: "inst-1",
      session_id: "sess-1",
      app_version: "1.0.0",
      platform: "electron",
      locale: "en",
      event_name: "assistant_turn_started",
      event_props: '{"channel":"text"}',
      client_ts_ms: 200,
    },
  ]);

  assert.ok(captured);
  assert.match(
    captured.sql,
    /VALUES \(\?, \?, \?, \?, \?, \?, \?, \?, \?\), \(\?, \?, \?, \?, \?, \?, \?, \?, \?\)/,
  );
  assert.equal(captured.params.length, 18);
  assert.equal(captured.params[2], "sess-1");
});
