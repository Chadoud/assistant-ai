const test = require("node:test");
const assert = require("node:assert/strict");
const { relayTokensAfterConnectSave } = require("./postConnectTokenRelay");

test("post-connect relay invokes token relay so the next calendar ask sees new scopes", async () => {
  let called = 0;
  const result = await relayTokensAfterConnectSave(async () => {
    called += 1;
    return { ok: true, relayed: ["google-calendar", "google"] };
  });
  assert.equal(result.ok, true);
  assert.equal(called, 1);
});

test("post-connect relay soft-fails when relay throws", async () => {
  const result = await relayTokensAfterConnectSave(async () => {
    throw new Error("backend down");
  });
  assert.equal(result.ok, false);
  assert.match(String(result.reason || ""), /backend down/);
});
