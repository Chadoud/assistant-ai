const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { resolvePackagedBackendBin } = require("./packagedBackendPath");

test("resolvePackagedBackendBin picks arch slice on macOS", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "exo-backend-"));
  try {
    fs.writeFileSync(path.join(root, "backend-x64"), "");
    fs.writeFileSync(path.join(root, "backend-arm64"), "");
    assert.equal(resolvePackagedBackendBin(root, "darwin", "x64"), path.join(root, "backend-x64"));
    assert.equal(
      resolvePackagedBackendBin(root, "darwin", "arm64"),
      path.join(root, "backend-arm64"),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("resolvePackagedBackendBin falls back to legacy backend on macOS", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "exo-backend-"));
  try {
    fs.writeFileSync(path.join(root, "backend"), "");
    assert.equal(resolvePackagedBackendBin(root, "darwin", "x64"), path.join(root, "backend"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
