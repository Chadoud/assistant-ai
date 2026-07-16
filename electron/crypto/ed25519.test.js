const test = require("node:test");
const assert = require("node:assert/strict");
const { loadEd25519 } = require("./ed25519");

test("loadEd25519 returns ok when @noble/ed25519 is installed", async () => {
  const result = await loadEd25519();
  assert.equal(result.ok, true);
  assert.equal(typeof result.ed.verifyAsync, "function");
});
