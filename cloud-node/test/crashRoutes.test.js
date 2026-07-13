const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { listenApp } = require("./helpers/httpHarness");

test("crash ingest validates body and token", async () => {
  process.env.CRASH_INGEST_TOKEN = "crash-test-token";
  delete require.cache[require.resolve("../lib/config")];
  delete require.cache[require.resolve("../routes/crash")];
  const crashRouter = require("../routes/crash");

  const app = express();
  app.use(express.json());
  app.use("/v1", crashRouter);
  const server = await listenApp(app);
  try {
    const noToken = await server.fetch("/v1/crash-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_version: "1.0.0",
        environment: "test",
        source: "unit",
        error_message: "boom",
      }),
    });
    assert.equal(noToken.status, 401);

    const badBody = await server.fetch("/v1/crash-reports", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Crash-Token": "crash-test-token",
      },
      body: JSON.stringify({ app_version: "1.0.0" }),
    });
    assert.equal(badBody.status, 422);
  } finally {
    await server.close();
    delete process.env.CRASH_INGEST_TOKEN;
  }
});
