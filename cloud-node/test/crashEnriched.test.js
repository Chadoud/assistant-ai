const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { listenApp } = require("./helpers/httpHarness");

/** @type {object[]} */
const crashQueries = [];

const mockPool = {
  async query(sql, params = []) {
    crashQueries.push({ sql, params });
    const n = sql.replace(/\s+/g, " ").trim().toLowerCase();
    if (n.includes("from crash_reports") && n.includes("dedupe_key")) {
      return [[]];
    }
    if (n.startsWith("insert into crash_reports")) {
      return [{ affectedRows: 1 }];
    }
    throw new Error(`unexpected query: ${sql.slice(0, 80)}`);
  },
};

test("crash ingest accepts enriched optional fields", async () => {
  crashQueries.length = 0;
  process.env.CRASH_INGEST_TOKEN = "crash-test-token";
  delete require.cache[require.resolve("../lib/config")];
  delete require.cache[require.resolve("../lib/db")];
  delete require.cache[require.resolve("../lib/crashEnrich")];
  delete require.cache[require.resolve("../routes/crash")];
  require("../lib/db").getPool = () => mockPool;
  const crashRouter = require("../routes/crash");

  const app = express();
  app.use(express.json());
  app.use("/v1", crashRouter);
  const server = await listenApp(app);
  try {
    const res = await server.fetch("/v1/crash-reports", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Crash-Token": "crash-test-token",
      },
      body: JSON.stringify({
        app_version: "1.0.0",
        environment: "test",
        source: "react_error_boundary",
        error_message: "Cannot read properties of null",
        session_id: "verify-session-12345678",
        instance_id: "verify-instance-12345678",
        active_feature: "assistant",
        intent_bucket: "messaging_whatsapp",
        tool_name: "send_message",
        dedupe_key: "dedupe-test-001",
        last_events_json:
          '[{"ts":1,"type":"tool","action":"send_message_started","meta":{"platform":"whatsapp_desktop"}}]',
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    const insert = crashQueries.find((q) =>
      q.sql.replace(/\s+/g, " ").trim().toLowerCase().startsWith("insert into crash_reports"),
    );
    assert.ok(insert);
    assert.ok(insert.params.includes("verify-session-12345678"));
    assert.ok(insert.params.includes("messaging_whatsapp"));
  } finally {
    await server.close();
    delete process.env.CRASH_INGEST_TOKEN;
  }
});
