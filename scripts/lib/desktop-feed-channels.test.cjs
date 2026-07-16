const test = require("node:test");
const assert = require("node:assert/strict");
const { getChannel, CHANNELS } = require("./desktop-feed-channels.cjs");

test("channels include staging stable lkg", () => {
  assert.ok(CHANNELS.staging);
  assert.ok(CHANNELS.stable);
  assert.ok(CHANNELS.lkg);
  assert.match(getChannel("stable").publicBase, /exo-assistant$/);
  assert.match(getChannel("staging").publicBase, /staging/);
});

test("unknown channel throws", () => {
  assert.throws(() => getChannel("canary"), /Unknown/);
});
