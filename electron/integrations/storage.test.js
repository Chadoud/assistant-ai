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

test("loadProviderSecretsWithDeps drops legacy plain records", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "integration-storage-"));
  const file = path.join(dir, "integration_accounts_v1.json");
  fs.writeFileSync(
    file,
    JSON.stringify({
      v: 1,
      "google-gmail": {
        enc: Buffer.from(JSON.stringify({ access_token: "leak" }), "utf8").toString("base64"),
        plain: true,
        updatedAt: Date.now(),
      },
    }),
    "utf8",
  );
  const deps = {
    safeStorageApi: {
      isEncryptionAvailable: () => true,
      encryptString: () => Buffer.from(""),
      decryptString: () => "",
    },
    fsApi: fs,
  };
  const loaded = loadProviderSecretsWithDeps(deps, dir, "google-gmail");
  assert.equal(loaded, null);
  const after = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(after["google-gmail"], undefined);
});
