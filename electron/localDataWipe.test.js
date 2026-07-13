const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { wipeElectronUserDataFiles, WIPE_FILES } = require("./localDataWipe");

test("wipeElectronUserDataFiles removes known artifacts", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "local-wipe-"));
  for (const name of WIPE_FILES) {
    fs.writeFileSync(path.join(dir, name), "x", "utf8");
  }
  fs.mkdirSync(path.join(dir, "settings_secrets_v1"), { recursive: true });
  fs.writeFileSync(path.join(dir, "settings_secrets_v1", "geminiApiKey.enc"), "enc");

  const result = wipeElectronUserDataFiles(dir);
  assert.equal(result.ok, true);
  assert.ok(result.removed.length >= WIPE_FILES.length);
  assert.equal(fs.existsSync(path.join(dir, "settings_secrets_v1")), false);
});
