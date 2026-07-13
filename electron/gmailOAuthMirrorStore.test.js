"use strict";

const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { describe, it } = require("node:test");
const {
  materializedMirrorPath,
  deleteMaterializedGmailOAuthMirror,
  legacyHomeMirrorPath,
} = require("./gmailOAuthMirrorStore");

describe("gmailOAuthMirrorStore paths", () => {
  it("materializedMirrorPath lives under userData", () => {
    const userData = path.join(os.tmpdir(), "exo-user");
    assert.equal(
      materializedMirrorPath(userData),
      path.join(userData, "gmail_oauth.json"),
    );
  });

  it("legacyHomeMirrorPath uses ~/.ai-file-sorter", () => {
    assert.match(legacyHomeMirrorPath(), /\.ai-file-sorter[\\/]+gmail_oauth\.json$/);
  });
});

describe("deleteMaterializedGmailOAuthMirror", () => {
  it("removes ephemeral mirror file when present", () => {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), "gmail-del-"));
    const mirrorPath = materializedMirrorPath(userData);
    try {
      fs.writeFileSync(mirrorPath, "{}", "utf8");
      deleteMaterializedGmailOAuthMirror(userData);
      assert.ok(!fs.existsSync(mirrorPath));
    } finally {
      fs.rmSync(userData, { recursive: true, force: true });
    }
  });
});
