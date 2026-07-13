#!/usr/bin/env node
/**
 * CLI: stage electron/resources backend slices before macOS packaging.
 * Usage: node scripts/stage-mac-backend-slices.cjs
 */
const path = require("path");
const { stageBackendSlices } = require("./lib/mac-packaging.cjs");

const resourcesDir = path.join(__dirname, "..", "electron", "resources");
stageBackendSlices(resourcesDir);
console.log("[stage-mac-backend-slices] OK");
