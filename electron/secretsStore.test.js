const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { writeSecretWithDeps } = require("./secretsStore");

test("writeSecretWithDeps fails closed when encryption unavailable", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "secrets-store-"));
  const result = writeSecretWithDeps(
    {
      userDataRoot: dir,
      safeStorageApi: { isEncryptionAvailable: () => false, encryptString: () => Buffer.from("") },
      fsApi: fs,
    },
    "geminiApiKey",
    "sk-test",
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, "encryption_unavailable");
});
