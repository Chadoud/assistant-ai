const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { readPrefs } = require("./syncWorker");

test("readPrefs returns defaults when file missing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-worker-"));
  const prefs = readPrefs(dir);
  assert.equal(prefs.enabled, false);
  assert.equal(prefs.deviceName, "Desktop");
});

test("readPrefs loads persisted json", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-worker-"));
  fs.writeFileSync(
    path.join(dir, "sync_prefs.json"),
    JSON.stringify({ enabled: true, deviceId: "dev-123", deviceName: "Laptop" }),
    "utf8",
  );
  const prefs = readPrefs(dir);
  assert.equal(prefs.enabled, true);
  assert.equal(prefs.deviceId, "dev-123");
  assert.equal(prefs.deviceName, "Laptop");
});
