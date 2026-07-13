const { test } = require("node:test");
const assert = require("node:assert");
const { signState, verifyState } = require("../lib/stateTokens");

test("state round-trips provider, nonce, and PKCE verifier", () => {
  const token = signState({ provider: "google", nonce: "n1", codeVerifier: "v1" });
  const decoded = verifyState(token);
  assert.equal(decoded.provider, "google");
  assert.equal(decoded.nonce, "n1");
  assert.equal(decoded.codeVerifier, "v1");
});

test("tampered state is rejected", () => {
  const token = signState({ provider: "apple", nonce: "n2" });
  assert.equal(verifyState(`${token}x`), null);
});

test("garbage state is rejected", () => {
  assert.equal(verifyState("not-a-jwt"), null);
});
