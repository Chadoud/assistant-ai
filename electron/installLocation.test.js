const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isRunningFromMountedVolume,
  isInstalledInApplications,
  getInstallLocationState,
} = require("./installLocation");

const FROM_DMG = "/Volumes/Exo/Exo.app/Contents/MacOS/Exo";
const FROM_APPS = "/Applications/Exo.app/Contents/MacOS/Exo";

test("isRunningFromMountedVolume detects /Volumes/ on darwin only", () => {
  if (process.platform === "darwin") {
    assert.equal(isRunningFromMountedVolume(FROM_DMG), true);
    assert.equal(isRunningFromMountedVolume(FROM_APPS), false);
  } else {
    assert.equal(isRunningFromMountedVolume(FROM_DMG), false);
  }
});

test("isInstalledInApplications detects /Applications/ on darwin", () => {
  if (process.platform === "darwin") {
    assert.equal(isInstalledInApplications(FROM_APPS), true);
    assert.equal(isInstalledInApplications(FROM_DMG), false);
  } else {
    // Non-macOS: install hint is never shown — treat as installed.
    assert.equal(isInstalledInApplications(FROM_APPS), true);
    assert.equal(isInstalledInApplications(FROM_DMG), true);
  }
});

test("getInstallLocationState shows hint only for mounted non-Applications installs on darwin", () => {
  if (process.platform === "darwin") {
    assert.deepEqual(getInstallLocationState(FROM_DMG), {
      runningFromMountedVolume: true,
      installedInApplications: false,
      showInstallHint: true,
    });
    assert.deepEqual(getInstallLocationState(FROM_APPS), {
      runningFromMountedVolume: false,
      installedInApplications: true,
      showInstallHint: false,
    });
  } else {
    assert.deepEqual(getInstallLocationState(FROM_DMG), {
      runningFromMountedVolume: false,
      installedInApplications: true,
      showInstallHint: false,
    });
    assert.deepEqual(getInstallLocationState(FROM_APPS), {
      runningFromMountedVolume: false,
      installedInApplications: true,
      showInstallHint: false,
    });
  }
});
