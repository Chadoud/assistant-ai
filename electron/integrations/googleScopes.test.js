const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("SCOPES_GMAIL includes modify, send, and settings.basic", () => {
  const src = fs.readFileSync(path.join(__dirname, "google.js"), "utf8");
  assert.match(src, /gmail\.modify/);
  assert.match(src, /gmail\.send/);
  assert.match(src, /gmail\.settings\.basic/);
});
