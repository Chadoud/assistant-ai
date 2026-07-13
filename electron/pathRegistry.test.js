"use strict";

const assert = require("node:assert/strict");
const path = require("path");
const { describe, it } = require("node:test");
const { isAllowedCodegenPreviewUrl } = require("./codegen/previewUrlPolicy");

describe("isAllowedCodegenPreviewUrl", () => {
  it("allows loopback dev-server ports in the managed range", () => {
    assert.equal(isAllowedCodegenPreviewUrl("http://127.0.0.1:5310/"), true);
    assert.equal(isAllowedCodegenPreviewUrl("http://localhost:5399/"), true);
  });

  it("rejects non-loopback and out-of-range ports", () => {
    assert.equal(isAllowedCodegenPreviewUrl("http://evil.example.com:5310/"), false);
    assert.equal(isAllowedCodegenPreviewUrl("http://127.0.0.1:5173/"), false);
    assert.equal(isAllowedCodegenPreviewUrl("file:///tmp/x"), false);
  });
});

describe("pathRegistry", () => {
  it("blocks sensitive home subdirs and allows studio path", () => {
    const os = require("os");
    const { isTrustedLocalPath } = require("./pathRegistry");
    const home = os.homedir();
    assert.equal(isTrustedLocalPath(path.join(home, ".ssh", "id_rsa")), false);
    assert.equal(isTrustedLocalPath(path.join(home, ".ai-manager", "studio", "proj")), true);
  });
});
