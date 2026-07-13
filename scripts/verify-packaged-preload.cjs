#!/usr/bin/env node
/**
 * Fail the macOS build if preload scripts are not real files beside app.asar.
 * Electron cannot load preload from inside the asar (account gate silently breaks).
 *
 * Usage:
 *   node scripts/verify-packaged-preload.cjs
 *   node scripts/verify-packaged-preload.cjs path/to/Exo.app
 */
const fs = require("fs");
const path = require("path");

const { findPackagedMacApp } = require("./find-packaged-mac-app.cjs");

const ROOT = path.join(__dirname, "..");
const appPath = process.argv[2] || findPackagedMacApp(ROOT);

if (!appPath || !fs.existsSync(appPath)) {
  console.error("[verify-packaged-preload] App bundle not found — pass a path or run package:mac first");
  process.exit(1);
}

const resources = path.join(appPath, "Contents", "Resources");
const required = ["preload.js", "preload-setup.js"];
let failed = false;

for (const file of required) {
  const p = path.join(resources, file);
  if (!fs.existsSync(p)) {
    console.error(`[verify-packaged-preload] Missing ${p}`);
    failed = true;
  } else {
    console.log(`[verify-packaged-preload] OK ${p}`);
  }
}

process.exit(failed ? 1 : 0);
