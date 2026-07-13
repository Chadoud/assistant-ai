const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

test("sendOrQueue mirrors to cloud before local delivery outcome", async () => {
  const tmpUserData = fs.mkdtempSync(path.join(os.tmpdir(), "exo-tq-"));
  const queueFile = path.join(tmpUserData, "telemetry-offline-queue.json");
  const cloudBodies = [];

  const electronMock = {
    app: {
      getPath(name) {
        if (name === "userData") return tmpUserData;
        throw new Error(`unexpected path ${name}`);
      },
    },
  };

  delete require.cache[require.resolve("./telemetryCloudSync")];
  delete require.cache[require.resolve("./telemetryQueue")];
  delete require.cache[require.resolve("electron")];
  delete require.cache[require.resolve("./state")];

  require.cache[require.resolve("electron")] = {
    exports: electronMock,
  };

  require("./telemetryCloudSync").syncEventsBatch = (body) => {
    cloudBodies.push(body);
  };

  require("./state").appToken = "test-token";

  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 503 });

  try {
    const { sendOrQueue } = require("./telemetryQueue");
    const url = "http://127.0.0.1:3847/v1/telemetry/events";
    const body = JSON.stringify({ instance_id: "desktop-test1234", events: [] });
    const result = await sendOrQueue(url, body);

    assert.equal(result.ok, true);
    assert.equal(result.delivered, false);
    assert.equal(result.queued, true);
    assert.equal(cloudBodies.length, 1);
    assert.equal(cloudBodies[0], body);
    assert.ok(fs.existsSync(queueFile));
  } finally {
    global.fetch = originalFetch;
    fs.rmSync(tmpUserData, { recursive: true, force: true });
  }
});
