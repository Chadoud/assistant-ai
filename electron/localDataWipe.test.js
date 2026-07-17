const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  wipeElectronUserDataFiles,
  wipeAllElectronProfiles,
} = require("./localDataWipe");
const {
  setActiveProfileId,
  resolveProfileRoot,
  activateAccountProfile,
} = require("./accountProfile");

test("wipeElectronUserDataFiles clears active profile vault only", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "local-wipe-"));
  activateAccountProfile(dir, "alice");
  const profileRoot = resolveProfileRoot(dir);
  fs.mkdirSync(path.join(profileRoot, "settings_secrets_v1"), { recursive: true });
  fs.writeFileSync(path.join(profileRoot, "settings_secrets_v1", "geminiApiKey.enc"), "enc");
  fs.writeFileSync(path.join(profileRoot, "sync_master_key.enc"), "k");
  fs.writeFileSync(path.join(dir, "cloud_session.json"), "{}");

  const result = wipeElectronUserDataFiles(dir);
  assert.equal(result.ok, true);
  assert.ok(result.removed.some((n) => String(n).includes("profiles/alice")));
  assert.equal(fs.existsSync(path.join(profileRoot, "settings_secrets_v1", "geminiApiKey.enc")), false);
  assert.ok(fs.existsSync(path.join(dir, "cloud_session.json")));
});

test("wipeAllElectronProfiles clears profiles and device session files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "local-wipe-all-"));
  activateAccountProfile(dir, "alice");
  fs.writeFileSync(path.join(resolveProfileRoot(dir), "a.txt"), "a");
  setActiveProfileId(dir, "bob");
  fs.writeFileSync(path.join(resolveProfileRoot(dir), "b.txt"), "b");
  fs.writeFileSync(path.join(dir, "cloud_session.json"), "{}");
  fs.writeFileSync(path.join(dir, "cloud_session_prefs.json"), "{}");

  const result = wipeAllElectronProfiles(dir);
  assert.equal(result.ok, true);
  assert.equal(fs.existsSync(path.join(dir, "profiles", "alice")), false);
  assert.equal(fs.existsSync(path.join(dir, "profiles", "bob")), false);
  // Guest vault is recreated empty after wipe-all.
  assert.ok(fs.existsSync(path.join(dir, "profiles", "guest")));
  assert.equal(fs.existsSync(path.join(dir, "cloud_session.json")), false);
  assert.equal(fs.existsSync(path.join(dir, "cloud_session_prefs.json")), false);
});
