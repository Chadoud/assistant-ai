const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  saveProviderSecretsWithDeps,
  loadProviderSecretsWithDeps,
} = require("./storage");

test("saveProviderSecretsWithDeps fails closed when encryption unavailable", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "integration-storage-"));
  const result = saveProviderSecretsWithDeps(
    {
      safeStorageApi: {
        isEncryptionAvailable: () => false,
        encryptString: () => Buffer.from(""),
        decryptString: () => "",
      },
      fsApi: fs,
    },
    dir,
    "google-gmail",
    { access_token: "secret" },
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, "encryption_unavailable");
});

test("saveProviderSecretsWithDeps roundtrips when encryption available", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "integration-storage-"));
  const deps = {
    safeStorageApi: {
      isEncryptionAvailable: () => true,
      encryptString: (value) => Buffer.from(`enc:${value}`, "utf8"),
      decryptString: (buf) => buf.toString("utf8").replace(/^enc:/, ""),
    },
    fsApi: fs,
  };
  const saved = saveProviderSecretsWithDeps(deps, dir, "microsoft", {
    access_token: "abc",
    refresh_token: "def",
  });
  assert.equal(saved.ok, true);
  const loaded = loadProviderSecretsWithDeps(deps, dir, "microsoft");
  assert.deepEqual(loaded, { access_token: "abc", refresh_token: "def" });
});
