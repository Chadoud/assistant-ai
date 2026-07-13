const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { listenApp } = require("./helpers/httpHarness");
const { signAccessToken } = require("../lib/tokens");

/** @type {object[]} */
const insertedEvents = [];
/** @type {object[]} */
const insertedFeedback = [];

const mockPool = {
  async query(sql, params = []) {
    const n = sql.replace(/\s+/g, " ").trim().toLowerCase();
    if (n.startsWith("insert into telemetry_events")) {
      insertedEvents.push({ sql, params });
      return [{ affectedRows: 1 }];
    }
    if (n.startsWith("insert into product_feedback")) {
      insertedFeedback.push({ sql, params });
      return [{ affectedRows: 1 }];
    }
    throw new Error(`unexpected query: ${sql.slice(0, 60)}`);
  },
};

test("telemetry ingest stores events with optional account", async () => {
  insertedEvents.length = 0;
  delete require.cache[require.resolve("../lib/db")];
  delete require.cache[require.resolve("../routes/telemetry")];
  require("../lib/db").getPool = () => mockPool;
  const telemetryRouter = require("../routes/telemetry");

  const app = express();
  app.use(express.json());
  app.use("/v1", telemetryRouter);
  const server = await listenApp(app);
  const token = signAccessToken("11111111-2222-4333-8444-555555555555");

  try {
    const bad = await server.fetch("/v1/telemetry/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instance_id: "x", events: [] }),
    });
    assert.equal(bad.status, 422);

    const ok = await server.fetch("/v1/telemetry/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        instance_id: "desktop-test1234",
        app_version: "1.0.0",
        platform: "electron",
        locale: "en",
        events: [{ name: "job_started", props: { destination: "inbox" } }],
      }),
    });
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.equal(body.ok, true);
    assert.equal(insertedEvents.length, 1);
    assert.equal(insertedEvents[0].params[0], "11111111-2222-4333-8444-555555555555");
  } finally {
    await server.close();
  }
});

test("telemetry ingest accepts session_id and assistant events", async () => {
  insertedEvents.length = 0;
  delete require.cache[require.resolve("../routes/telemetry")];
  const telemetryRouter = require("../routes/telemetry");

  const app = express();
  app.use(express.json());
  app.use("/v1", telemetryRouter);
  const server = await listenApp(app);

  try {
    const ok = await server.fetch("/v1/telemetry/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instance_id: "desktop-test1234",
        session_id: "session-test1234",
        app_version: "1.0.0",
        platform: "electron",
        locale: "en",
        events: [
          {
            name: "assistant_turn_started",
            props: { channel: "text" },
          },
        ],
      }),
    });
    assert.equal(ok.status, 200);
    assert.equal(insertedEvents.length, 1);
    assert.equal(insertedEvents[0].params[2], "session-test1234");
  } finally {
    await server.close();
  }
});

test("feedback ingest validates category", async () => {
  insertedFeedback.length = 0;
  delete require.cache[require.resolve("../routes/telemetry")];
  const telemetryRouter = require("../routes/telemetry");

  const app = express();
  app.use(express.json());
  app.use("/v1", telemetryRouter);
  const server = await listenApp(app);

  try {
    const ok = await server.fetch("/v1/telemetry/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instance_id: "desktop-test1234",
        category: "idea",
        message: "Add bulk rename after sort.",
      }),
    });
    assert.equal(ok.status, 200);
    assert.equal(insertedFeedback.length, 1);
    assert.equal(insertedFeedback[0].params[0], null);
  } finally {
    await server.close();
  }
});
