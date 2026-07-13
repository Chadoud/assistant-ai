const test = require("node:test");
const assert = require("node:assert/strict");

test("postCloud returns false when cloud URL is unset", async () => {
  const prev = process.env.EXOSITES_CLOUD_URL;
  delete process.env.EXOSITES_CLOUD_URL;
  delete require.cache[require.resolve("./cloudAuth")];
  delete require.cache[require.resolve("./telemetryCloudSync")];

  const { postCloud } = require("./telemetryCloudSync");
  const ok = await postCloud("/v1/telemetry/events", "{}", "/tmp/userdata");
  assert.equal(ok, false);

  if (prev !== undefined) process.env.EXOSITES_CLOUD_URL = prev;
});
