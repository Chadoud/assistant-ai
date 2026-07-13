const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { listenApp } = require("./helpers/httpHarness");

test("GET /v1/me exposes is_product_admin from profile", async () => {
  const accounts = require("../lib/accounts");
  const originalGetProfile = accounts.getProfile;
  accounts.getProfile = async () => ({
    account_id: "admin-account",
    email: "chadykassab@gmail.com",
    trial_active: true,
    is_product_admin: true,
    entitlements: [],
  });

  const { signAccessToken } = require("../lib/tokens");
  const meRouter = require("../routes/me");

  const app = express();
  app.use(express.json());
  app.use("/v1", meRouter);
  const server = await listenApp(app);

  try {
    const token = signAccessToken("admin-account");
    const res = await server.fetch("/v1/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.is_product_admin, true);
    assert.equal(body.email, "chadykassab@gmail.com");
  } finally {
    accounts.getProfile = originalGetProfile;
    await server.close();
  }
});
