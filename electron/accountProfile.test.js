const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  GUEST_ID,
  sanitizeProfileId,
  accountIdFromAccessToken,
  getActiveProfileId,
  resolveProfileRoot,
  setActiveProfileId,
  migrateLegacyFlatToProfile,
  activateAccountProfile,
  activateGuestProfile,
  wipeActiveProfile,
  wipeAllProfiles,
  alignProfileWithSession,
  setProfileChangeListener,
  PROFILE_FILES,
  PROFILE_DIRS,
  PROFILE_STAGING_DIRS,
} = require("./accountProfile");

/** @type {string} */
let tmp;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "exo-profile-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("sanitizeProfileId accepts uuid-like and guest", () => {
  assert.equal(sanitizeProfileId("guest"), "guest");
  assert.equal(sanitizeProfileId("a1b2c3d4-e5f6-7890-abcd-ef1234567890"), "a1b2c3d4-e5f6-7890-abcd-ef1234567890");
  assert.equal(sanitizeProfileId("../etc"), null);
  assert.equal(sanitizeProfileId("has space"), null);
  assert.equal(sanitizeProfileId(""), null);
});

test("accountIdFromAccessToken reads JWT sub", () => {
  const payload = Buffer.from(JSON.stringify({ sub: "acc-123_456", token_use: "access" })).toString(
    "base64url"
  );
  const token = `hdr.${payload}.sig`;
  assert.equal(accountIdFromAccessToken(token), "acc-123_456");
  assert.equal(accountIdFromAccessToken("bad"), null);
});

test("setActiveProfileId and resolveProfileRoot", () => {
  const r = setActiveProfileId(tmp, "user_one");
  assert.equal(r.ok, true);
  assert.equal(getActiveProfileId(tmp), "user_one");
  assert.equal(resolveProfileRoot(tmp), path.join(tmp, "profiles", "user_one"));
  assert.ok(fs.existsSync(resolveProfileRoot(tmp)));
});

test("migrateLegacyFlatToProfile moves inventory once", () => {
  fs.writeFileSync(path.join(tmp, "entitlement.json"), "{}");
  fs.mkdirSync(path.join(tmp, "settings_secrets_v1"));
  fs.writeFileSync(path.join(tmp, "settings_secrets_v1", "x.enc"), "e");
  fs.writeFileSync(path.join(tmp, "conversations.sqlite"), "db");
  fs.mkdirSync(path.join(tmp, "drive_sort_staging"));

  const first = migrateLegacyFlatToProfile(tmp, "acctA");
  assert.equal(first.ok, true);
  assert.equal(first.skipped, false);
  assert.ok(first.moved.includes("entitlement.json"));
  assert.ok(first.moved.includes("settings_secrets_v1/"));
  assert.ok(first.moved.includes("conversations.sqlite"));
  assert.ok(first.moved.includes("drive_sort_staging/"));

  assert.ok(!fs.existsSync(path.join(tmp, "entitlement.json")));
  assert.ok(fs.existsSync(path.join(tmp, "profiles", "acctA", "entitlement.json")));
  assert.ok(fs.existsSync(path.join(tmp, "profiles", "acctA", "settings_secrets_v1", "x.enc")));

  const second = migrateLegacyFlatToProfile(tmp, "acctA");
  assert.equal(second.skipped, true);
});

test("activateAccountProfile then guest isolates roots", () => {
  fs.writeFileSync(path.join(tmp, "sync_master_key.enc"), "k");
  activateAccountProfile(tmp, "alice");
  assert.equal(getActiveProfileId(tmp), "alice");
  assert.ok(fs.existsSync(path.join(tmp, "profiles", "alice", "sync_master_key.enc")));

  fs.writeFileSync(path.join(resolveProfileRoot(tmp), "marker-alice"), "1");
  activateGuestProfile(tmp);
  assert.equal(getActiveProfileId(tmp), GUEST_ID);
  assert.ok(!fs.existsSync(path.join(resolveProfileRoot(tmp), "marker-alice")));
  assert.ok(fs.existsSync(path.join(tmp, "profiles", "alice", "marker-alice")));
});

test("wipeActiveProfile only clears current profile", () => {
  setActiveProfileId(tmp, "a");
  fs.writeFileSync(path.join(resolveProfileRoot(tmp), "a.txt"), "a");
  setActiveProfileId(tmp, "b");
  fs.writeFileSync(path.join(resolveProfileRoot(tmp), "b.txt"), "b");
  const wiped = wipeActiveProfile(tmp);
  assert.equal(wiped.ok, true);
  assert.ok(!fs.existsSync(path.join(tmp, "profiles", "b", "b.txt")));
  assert.ok(fs.existsSync(path.join(tmp, "profiles", "a", "a.txt")));
});

test("wipeAllProfiles removes tree", () => {
  setActiveProfileId(tmp, "a");
  fs.writeFileSync(path.join(resolveProfileRoot(tmp), "a.txt"), "a");
  const wiped = wipeAllProfiles(tmp);
  assert.equal(wiped.ok, true);
  assert.ok(!fs.existsSync(path.join(tmp, "profiles", "a")));
  assert.equal(getActiveProfileId(tmp), GUEST_ID);
});

test("inventory lists are non-empty", () => {
  assert.ok(PROFILE_FILES.length > 5);
  assert.ok(PROFILE_DIRS.includes("settings_secrets_v1"));
  assert.ok(PROFILE_DIRS.includes("box_sort_staging"));
  assert.ok(PROFILE_DIRS.includes("infomaniak_mail_sort_staging"));
  assert.ok(PROFILE_STAGING_DIRS.includes("box_sort_staging"));
  assert.ok(PROFILE_STAGING_DIRS.includes("infomaniak_mail_sort_staging"));
  assert.ok(!PROFILE_STAGING_DIRS.includes("settings_secrets_v1"));
});

test("wipeActiveProfile notifies listeners even when id unchanged", () => {
  setActiveProfileId(tmp, "wipe_notify");
  let calls = 0;
  setProfileChangeListener(() => {
    calls += 1;
  });
  const wiped = wipeActiveProfile(tmp);
  assert.equal(wiped.ok, true);
  assert.equal(calls, 1);
  setProfileChangeListener(null);
});

test("alignProfileWithSession fails closed to guest without account id", () => {
  setActiveProfileId(tmp, "alice");
  const out = alignProfileWithSession(tmp, { access_token: "not-a-jwt" });
  assert.equal(out.activeId, GUEST_ID);
});

test("alignProfileWithSession activates JWT sub", () => {
  // header.payload.sig — payload {"sub":"user_abc"}
  const payload = Buffer.from(JSON.stringify({ sub: "user_abc" })).toString("base64url");
  const token = `e30.${payload}.sig`;
  const out = alignProfileWithSession(tmp, { access_token: token });
  assert.equal(out.activeId, "user_abc");
  assert.equal(getActiveProfileId(tmp), "user_abc");
});
