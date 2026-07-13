"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, it, before, after, beforeEach } = require("node:test");

function makeJwt(expSecondsFromNow) {
  const exp = Math.floor(Date.now() / 1000) + expSecondsFromNow;
  const payload = Buffer.from(JSON.stringify({ exp }), "utf8").toString("base64url");
  return `hdr.${payload}.sig`;
}

function writePlainSession(userData, session) {
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(
    path.join(userData, "cloud_session.json"),
    JSON.stringify({ v: 1, ...session }, null, 2),
    "utf8",
  );
}

function loadCloudAuth() {
  delete require.cache[require.resolve("./cloudAuth")];
  return require("./cloudAuth");
}

describe("ensureFreshSession refresh single-flight", () => {
  const prevCloudUrl = process.env.EXOSITES_CLOUD_URL;
  const originalFetch = global.fetch;
  let userData = "";
  let refreshCalls = 0;

  beforeEach(() => {
    userData = fs.mkdtempSync(path.join(os.tmpdir(), "exo-cloud-auth-"));
    refreshCalls = 0;
    process.env.EXOSITES_CLOUD_URL = "https://api.test.exosites.ch";
  });

  after(() => {
    global.fetch = originalFetch;
    if (prevCloudUrl === undefined) delete process.env.EXOSITES_CLOUD_URL;
    else process.env.EXOSITES_CLOUD_URL = prevCloudUrl;
  });

  it("returns cached session when access token is still valid", async () => {
    writePlainSession(userData, {
      access_token: makeJwt(3600),
      refresh_token: "rt-valid",
      email: "user@test.com",
    });
    global.fetch = async () => {
      throw new Error("refresh should not run");
    };
    const cloudAuth = loadCloudAuth();
    cloudAuth.resetRefreshInFlightForTests();
    const session = await cloudAuth.ensureFreshSession(userData);
    assert.equal(session?.email, "user@test.com");
    assert.equal(refreshCalls, 0);
  });

  it("dedupes concurrent refresh calls into one POST", async () => {
    writePlainSession(userData, {
      access_token: makeJwt(30),
      refresh_token: "rt-old",
      email: "user@test.com",
    });
    global.fetch = async (url, init) => {
      if (String(url).endsWith("/auth/refresh")) {
        refreshCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 40));
        assert.equal(JSON.parse(String(init.body)).refresh_token, "rt-old");
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              access_token: makeJwt(3600),
              refresh_token: "rt-new",
            }),
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    };
    const cloudAuth = loadCloudAuth();
    cloudAuth.resetRefreshInFlightForTests();
    const [a, b, c] = await Promise.all([
      cloudAuth.ensureFreshSession(userData),
      cloudAuth.ensureFreshSession(userData),
      cloudAuth.ensureFreshSession(userData),
    ]);
    assert.equal(refreshCalls, 1);
    assert.equal(a?.access_token, b?.access_token);
    assert.equal(b?.access_token, c?.access_token);
    const stored = JSON.parse(
      fs.readFileSync(path.join(userData, "cloud_session.json"), "utf8"),
    );
    assert.equal(stored.refresh_token, "rt-new");
  });

  it("keeps session on transient refresh failure", async () => {
    writePlainSession(userData, {
      access_token: makeJwt(30),
      refresh_token: "rt-old",
      email: "user@test.com",
    });
    global.fetch = async (url) => {
      if (String(url).endsWith("/auth/refresh")) {
        refreshCalls += 1;
        throw new TypeError("fetch failed");
      }
      throw new Error(`unexpected fetch: ${url}`);
    };
    const cloudAuth = loadCloudAuth();
    cloudAuth.resetRefreshInFlightForTests();
    const session = await cloudAuth.ensureFreshSession(userData);
    assert.equal(refreshCalls, 1);
    assert.equal(session?.refresh_token, "rt-old");
    assert.ok(fs.existsSync(path.join(userData, "cloud_session.json")));
  });

  it("uses session written by concurrent refresh instead of clearing on 401", async () => {
    writePlainSession(userData, {
      access_token: makeJwt(30),
      refresh_token: "rt-old",
      email: "user@test.com",
    });
    global.fetch = async (url) => {
      if (String(url).endsWith("/auth/refresh")) {
        refreshCalls += 1;
        writePlainSession(userData, {
          access_token: makeJwt(3600),
          refresh_token: "rt-new",
          email: "user@test.com",
        });
        return {
          ok: false,
          status: 401,
          text: async () => JSON.stringify({ detail: "Invalid refresh token" }),
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    };
    const cloudAuth = loadCloudAuth();
    cloudAuth.resetRefreshInFlightForTests();
    const session = await cloudAuth.ensureFreshSession(userData);
    assert.equal(refreshCalls, 1);
    assert.equal(session?.refresh_token, "rt-new");
    assert.ok(fs.existsSync(path.join(userData, "cloud_session.json")));
  });
});
