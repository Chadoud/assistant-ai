const test = require("node:test");
const assert = require("node:assert/strict");

const {
  updaterAsarFileGlobs,
  verifyUpdaterPackagingConfig,
} = require("./updater-packaging.cjs");

test("updaterAsarFileGlobs includes electron-updater", () => {
  const globs = updaterAsarFileGlobs();
  assert.ok(globs.some((g) => g.startsWith("node_modules/electron-updater/")));
  assert.ok(globs.some((g) => g.startsWith("node_modules/builder-util-runtime/")));
});

test("mac electron-builder config bundles electron-updater", () => {
  assert.equal(verifyUpdaterPackagingConfig(), true);
});
