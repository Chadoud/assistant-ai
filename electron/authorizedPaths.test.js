const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");

const userData = fs.mkdtempSync(path.join(os.tmpdir(), "authorized-paths-ud-"));
const home = fs.mkdtempSync(path.join(os.tmpdir(), "authorized-paths-home-"));

const electronStub = {
  app: {
    getPath: (name) => {
      if (name === "userData") return userData;
      throw new Error(`unexpected getPath(${name})`);
    },
  },
};

const originalLoad = Module._load;
Module._load = function mockElectron(request, parent, isMain) {
  if (request === "electron") return electronStub;
  return originalLoad(request, parent, isMain);
};

const {
  recordAuthorizedPath,
  isAuthorizedFolder,
  isSafeUserContentPath,
  resetAuthorizedPathsCacheForTests,
} = require("./authorizedPaths");

test.after(() => {
  Module._load = originalLoad;
});

test.beforeEach(() => {
  resetAuthorizedPathsCacheForTests();
  try {
    fs.unlinkSync(path.join(userData, "authorized_paths_v1.json"));
  } catch {
    /* ignore */
  }
});

test("isAuthorizedFolder allows userData without dialog grant", () => {
  assert.equal(isAuthorizedFolder(path.join(userData, "nested")), true);
});

test("isAuthorizedFolder rejects home without grant (M2.8)", () => {
  assert.equal(isAuthorizedFolder(path.join(home, "Documents")), false);
});

test("isAuthorizedFolder allows granted folder", () => {
  const granted = path.join(home, "SortOut");
  fs.mkdirSync(granted, { recursive: true });
  recordAuthorizedPath(granted);
  assert.equal(isAuthorizedFolder(path.join(granted, "Invoices")), true);
});

test("isAuthorizedFolder still blocks .ssh under real home", () => {
  assert.equal(isAuthorizedFolder(path.join(os.homedir(), ".ssh")), false);
});

test("isAuthorizedFolder blocks app secrets under userData", () => {
  assert.equal(isAuthorizedFolder(path.join(userData, "gmail_oauth.json")), false);
  assert.equal(isAuthorizedFolder(path.join(userData, "settings_secrets_v1", "x")), false);
  assert.equal(isAuthorizedFolder(path.join(userData, "sync_master_key.enc")), false);
});

test("isSafeUserContentPath rejects userData entirely", () => {
  assert.equal(isSafeUserContentPath(path.join(userData, "nested")), false);
  assert.equal(isSafeUserContentPath(path.join(userData, "gmail_oauth.json")), false);
});

test("isSafeUserContentPath rejects home without grant", () => {
  assert.equal(isSafeUserContentPath(path.join(home, "Documents", "a.txt")), false);
});

test("isSafeUserContentPath allows dialog-granted folder", () => {
  const granted = path.join(home, "Inbox");
  fs.mkdirSync(granted, { recursive: true });
  recordAuthorizedPath(granted);
  assert.equal(isSafeUserContentPath(path.join(granted, "note.txt")), true);
});

test("isSafeUserContentPath still blocks .ssh even if somehow granted", () => {
  const ssh = path.join(os.homedir(), ".ssh");
  recordAuthorizedPath(ssh);
  assert.equal(isSafeUserContentPath(path.join(ssh, "id_rsa")), false);
});
