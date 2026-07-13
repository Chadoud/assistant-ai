const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseExoAuthCallbackUrl,
  handleSocialAuthCallbackUrl,
  waitForSocialAuthCallback,
  cancelPendingSocialAuth,
} = require("./socialAuthCallback");

test("parseExoAuthCallbackUrl accepts exo_code", () => {
  const r = parseExoAuthCallbackUrl("exo://auth/callback?exo_code=abc123");
  assert.equal(r?.ok, true);
  if (r?.ok) assert.equal(r.code, "abc123");
});

test("parseExoAuthCallbackUrl maps error param", () => {
  const r = parseExoAuthCallbackUrl("exo://auth/callback?error=cancelled");
  assert.equal(r?.ok, false);
  if (r && !r.ok) assert.equal(r.error, "cancelled");
});

test("handleSocialAuthCallbackUrl resolves pending waiter", async () => {
  const waitPromise = waitForSocialAuthCallback(5000);
  assert.equal(handleSocialAuthCallbackUrl("exo://auth/callback?exo_code=xyz"), true);
  const result = await waitPromise;
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.code, "xyz");
});

test("handleSocialAuthCallbackUrl buffers until waiter starts", async () => {
  assert.equal(handleSocialAuthCallbackUrl("exo://auth/callback?exo_code=early"), true);
  const result = await waitForSocialAuthCallback(5000);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.code, "early");
});

test("cancelPendingSocialAuth rejects pending waiter", async () => {
  const waitPromise = waitForSocialAuthCallback(5000);
  cancelPendingSocialAuth();
  const result = await waitPromise;
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "cancelled");
});
