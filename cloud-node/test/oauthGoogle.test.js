const { test } = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");

process.env.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
process.env.GOOGLE_CLIENT_SECRET = "test-secret";

const google = require("../lib/oauthGoogle");

test("isConfigured reflects env", () => {
  assert.equal(google.isConfigured(), true);
});

test("PKCE challenge is the S256 of the verifier", () => {
  const { verifier, challenge } = google.generatePkce();
  const expected = crypto.createHash("sha256").update(verifier).digest("base64url");
  assert.equal(challenge, expected);
});

test("auth URL carries PKCE + OIDC params", () => {
  const url = new URL(
    google.buildAuthUrl({ state: "st", nonce: "no", codeChallenge: "ch" }),
  );
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("code_challenge"), "ch");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("state"), "st");
  assert.equal(url.searchParams.get("nonce"), "no");
  assert.match(url.searchParams.get("scope"), /openid/);
});
