#!/usr/bin/env node
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const SCRIPT = path.join(__dirname, "sync-integration-config-release-env.js");
const BACKEND_ENV = path.join(ROOT, "backend", ".env");
const INTEGRATION_JSON = path.join(ROOT, "electron", "resources", "integration-config.json");

if (!fs.existsSync(BACKEND_ENV)) {
  console.log("sync-integration-config-release-env.test.js: skipped (no backend/.env)");
  process.exit(0);
}

execFileSync(process.execPath, [SCRIPT], { cwd: ROOT, stdio: "pipe" });
const written = JSON.parse(fs.readFileSync(INTEGRATION_JSON, "utf8"));

assert.ok(written.EXOSITES_DROPBOX_APP_KEY, "sync should write EXOSITES_DROPBOX_APP_KEY from backend/.env");
assert.ok(
  written.EXOSITES_MICROSOFT_OAUTH_CLIENT_ID,
  "sync should write EXOSITES_MICROSOFT_OAUTH_CLIENT_ID from backend/.env",
);

console.log("sync-integration-config-release-env.test.js: ok");
