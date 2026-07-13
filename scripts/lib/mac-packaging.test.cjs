const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const {
  backendSliceName,
  packagingMode,
  stageBackendSlices,
  verifyBackendSlices,
  dmgArtifactName,
} = require("./mac-packaging.cjs");

test("backendSliceName maps arch to resource name", () => {
  assert.equal(backendSliceName("x64"), "backend-x64");
  assert.equal(backendSliceName("arm64"), "backend-arm64");
});

test("packagingMode reflects EXO_MAC_UNIVERSAL", () => {
  assert.equal(packagingMode({ EXO_MAC_UNIVERSAL: "1" }), "universal");
  assert.match(packagingMode({ EXO_MAC_UNIVERSAL: "0" }), /^native-/);
});

test("dmgArtifactName is arch-specific unless universal", () => {
  assert.equal(dmgArtifactName({ EXO_MAC_UNIVERSAL: "1" }), "Exo-universal.${ext}");
  assert.match(dmgArtifactName({ EXO_MAC_UNIVERSAL: "0" }), /^Exo-(x64|arm64)\.\$\{ext\}$/);
});

test("stageBackendSlices keeps one slice for native builds", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exo-mac-pack-"));
  const x64 = path.join(dir, "backend-x64");
  const arm64 = path.join(dir, "backend-arm64");
  fs.writeFileSync(x64, "x64");
  fs.writeFileSync(arm64, "arm64");

  const nativeArch = process.arch === "arm64" ? "arm64" : "x64";
  stageBackendSlices(dir, { EXO_MAC_UNIVERSAL: "0" });

  const kept = path.join(dir, backendSliceName(nativeArch));
  const removed = path.join(dir, backendSliceName(nativeArch === "arm64" ? "x64" : "arm64"));
  assert.ok(fs.existsSync(kept));
  assert.ok(!fs.existsSync(removed));

  fs.rmSync(dir, { recursive: true, force: true });
});

test("verifyBackendSlices rejects duplicate slices in native mode", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exo-mac-verify-"));
  fs.writeFileSync(path.join(dir, "backend-x64"), "x");
  fs.writeFileSync(path.join(dir, "backend-arm64"), "a");

  const nativeArch = process.arch === "arm64" ? "arm64" : "x64";
  const env = { EXO_MAC_UNIVERSAL: "0" };
  assert.equal(verifyBackendSlices(dir, { env, strictArch: false }), false);

  fs.unlinkSync(path.join(dir, backendSliceName(nativeArch === "arm64" ? "x64" : "arm64")));
  assert.equal(verifyBackendSlices(dir, { env, strictArch: false }), true);

  fs.rmSync(dir, { recursive: true, force: true });
});
