const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const { listenApp } = require("./helpers/httpHarness");
const { metricsMiddleware, prometheusText, recordHttpRequest } = require("../lib/metrics");

test("prometheusText includes uptime and request counters", async () => {
  recordHttpRequest("GET", 200, "/health");
  const body = prometheusText();
  assert.match(body, /exo_cloud_uptime_seconds \d+/);
  assert.match(body, /exo_cloud_http_requests_total\{method="GET",path="\/health",status="200"\} 1/);
});

test("metricsMiddleware records finished responses", async () => {
  const app = express();
  app.use(metricsMiddleware);
  app.get("/probe", (_req, res) => res.status(204).end());

  const server = await listenApp(app);
  try {
    const res = await server.fetch("/probe");
    assert.equal(res.status, 204);
    const body = prometheusText();
    assert.match(body, /path="\/probe",status="204"/);
  } finally {
    await server.close();
  }
});
