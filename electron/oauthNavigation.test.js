"use strict";

const assert = require("assert");
const { describe, it } = require("node:test");
const {
  isTrustedOAuthNavigationUrl,
  parseAuthDoneCallback,
} = require("./oauthNavigation");

const BASE = "https://api.exosites.ch";

describe("isTrustedOAuthNavigationUrl", () => {
  it("allows API origin and Google OAuth hosts", () => {
    assert.strictEqual(
      isTrustedOAuthNavigationUrl(BASE, `${BASE}/auth/start/google`, "google"),
      true
    );
    assert.strictEqual(
      isTrustedOAuthNavigationUrl(
        BASE,
        "https://accounts.google.com/o/oauth2/v2/auth?client_id=x",
        "google"
      ),
      true
    );
  });

  it("blocks unknown hosts", () => {
    assert.strictEqual(
      isTrustedOAuthNavigationUrl(BASE, "https://evil.example/phish", "google"),
      false
    );
    assert.strictEqual(
      isTrustedOAuthNavigationUrl(BASE, "http://api.exosites.ch/auth/done", "google"),
      false
    );
  });
});

describe("parseAuthDoneCallback", () => {
  it("accepts exo_code only on API /auth/done", () => {
    const ok = parseAuthDoneCallback(BASE, `${BASE}/auth/done?exo_code=abc123`);
    assert.deepStrictEqual(ok, { ok: true, code: "abc123" });

    assert.strictEqual(parseAuthDoneCallback(BASE, `${BASE}/auth/other?exo_code=x`), null);
    assert.strictEqual(
      parseAuthDoneCallback(BASE, "https://accounts.google.com/auth/done?exo_code=x"),
      null
    );
  });

  it("maps error query param", () => {
    const fail = parseAuthDoneCallback(BASE, `${BASE}/auth/done?error=cancelled`);
    assert.deepStrictEqual(fail, { ok: false, error: "cancelled" });
  });
});
