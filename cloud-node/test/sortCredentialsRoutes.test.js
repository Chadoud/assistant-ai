const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { listenApp } = require("./helpers/httpHarness");

function reloadSortCredentialsRouter() {
  delete require.cache[require.resolve("../lib/config")];
  delete require.cache[require.resolve("../lib/sortLlmCredentials")];
  delete require.cache[require.resolve("../routes/sortCredentials")];
  return require("../routes/sortCredentials");
}

test("POST /v1/sort/credentials requires auth and returns mock token", async () => {
  process.env.SORT_LLM_MOCK_TOKEN = "unit-test-sort-token";
  process.env.SORT_LLM_BASE_URL = "https://llm.example.test";

  const accounts = require("../lib/accounts");
  const originalGetProfile = accounts.getProfile;
  accounts.getProfile = async () => ({
    trial_active: true,
    entitlements: [{ feature: "sort", active: true }],
  });

  const { signAccessToken } = require("../lib/tokens");
  const sortCredentialsRouter = reloadSortCredentialsRouter();

  const app = express();
  app.use(express.json());
  app.use("/v1", sortCredentialsRouter);
  const server = await listenApp(app);

  try {
    const noAuth = await server.fetch("/v1/sort/credentials", { method: "POST" });
    assert.equal(noAuth.status, 401);

    const token = signAccessToken("account-123");
    const res = await server.fetch("/v1/sort/credentials", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.endpoint, "https://llm.example.test");
    assert.equal(body.token, "unit-test-sort-token");
    assert.equal(body.sort_service_mode, "cloud");
    assert.equal(body.credentials_managed, true);
    assert.ok(Array.isArray(body.models));
    assert.ok(body.expires_in > 0);
    assert.equal(body.max_parallel_requests, 2);
    assert.equal(body.llm_max_slots, 2);
    assert.equal(body.sort_max_concurrency, 2);
  } finally {
    accounts.getProfile = originalGetProfile;
    await server.close();
    delete process.env.SORT_LLM_MOCK_TOKEN;
    delete process.env.SORT_LLM_BASE_URL;
  }
});

test("POST /v1/sort/credentials returns 402 when not entitled", async () => {
  process.env.SORT_LLM_MOCK_TOKEN = "unit-test-sort-token";

  const accounts = require("../lib/accounts");
  const originalGetProfile = accounts.getProfile;
  accounts.getProfile = async () => ({
    trial_active: false,
    entitlements: [{ feature: "sort", active: false }],
  });

  const { signAccessToken } = require("../lib/tokens");
  const sortCredentialsRouter = reloadSortCredentialsRouter();

  const app = express();
  app.use(express.json());
  app.use("/v1", sortCredentialsRouter);
  const server = await listenApp(app);

  try {
    const token = signAccessToken("account-456");
    const res = await server.fetch("/v1/sort/credentials", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 402);
    const body = await res.json();
    assert.equal(body.detail, "sort_not_entitled");
  } finally {
    accounts.getProfile = originalGetProfile;
    await server.close();
    delete process.env.SORT_LLM_MOCK_TOKEN;
  }
});
