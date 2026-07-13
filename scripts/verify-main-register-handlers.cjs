#!/usr/bin/env node
/**
 * Regression guard: main.js must call registerHandlers() before app.whenReady.
 * Missing call breaks all IPC (account gate, cloud auth providers, etc.).
 */
const fs = require("fs");
const path = require("path");

const mainPath = path.join(__dirname, "..", "electron", "main.js");
const src = fs.readFileSync(mainPath, "utf8");

if (!/\bregisterHandlers\s*\(\s*\)/.test(src)) {
  console.error("[verify-main-register-handlers] registerHandlers() not found in electron/main.js");
  process.exit(1);
}

const readyIdx = src.indexOf("app.whenReady");
const callIdx = src.indexOf("registerHandlers()");
if (readyIdx !== -1 && callIdx !== -1 && callIdx > readyIdx) {
  console.error(
    "[verify-main-register-handlers] registerHandlers() must run before app.whenReady()",
  );
  process.exit(1);
}

console.log("[verify-main-register-handlers] OK");
