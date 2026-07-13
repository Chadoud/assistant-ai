"use strict";

const assert = require("assert");
const { describe, it } = require("node:test");
const { fetchAuthProviders, probeOAuthStart } = require("./cloudAuthProviders");

describe("fetchAuthProviders", () => {
  it("merges /v1/public/auth-config when present", async () => {
    const fetchImpl = async (url) => {
      if (url.endsWith("/v1/public/auth-config")) {
        return {
          ok: true,
          json: async () => ({ providers: { google: true, apple: false } }),
        };
      }
      throw new Error(`unexpected fetch ${url}`);
    };
    const providers = await fetchAuthProviders("https://api.exosites.ch", fetchImpl);
    assert.deepStrictEqual(providers, {
      password: true,
      google: true,
      apple: false,
    });
  });

  it("probes /auth/start when auth-config is missing", async () => {
    const fetchImpl = async (url, init) => {
      if (url.endsWith("/v1/public/auth-config")) {
        return { ok: false, status: 404 };
      }
      if (url.endsWith("/auth/start/google") && init?.redirect === "manual") {
        return { status: 302 };
      }
      if (url.endsWith("/auth/start/apple") && init?.redirect === "manual") {
        return { status: 404 };
      }
      throw new Error(`unexpected fetch ${url}`);
    };
    const providers = await fetchAuthProviders("https://api.exosites.ch", fetchImpl);
    assert.strictEqual(providers.google, true);
    assert.strictEqual(providers.apple, false);
    assert.strictEqual(providers.password, true);
  });
});

describe("probeOAuthStart", () => {
  it("treats 3xx as configured", async () => {
    const ok = await probeOAuthStart(
      "https://api.exosites.ch",
      "google",
      async () => ({ status: 302 })
    );
    assert.strictEqual(ok, true);
  });

  it("treats 404 as unavailable", async () => {
    const ok = await probeOAuthStart(
      "https://api.exosites.ch",
      "google",
      async () => ({ status: 404 })
    );
    assert.strictEqual(ok, false);
  });
});
