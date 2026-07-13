#!/usr/bin/env node
/**
 * lint-staged wrapper: paths are repo-root relative (`frontend/src/...`);
 * ESLint runs with cwd=frontend/ and expects `src/...`.
 */
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const fs = require("node:fs");

const files = process.argv
  .slice(2)
  .map((filePath) => filePath.replace(/^frontend\//, ""))
  .filter((filePath) => filePath && fs.existsSync(path.join(__dirname, "..", "frontend", filePath)));

if (files.length === 0) {
  process.exit(0);
}

const result = spawnSync("npm", ["exec", "eslint", "--", "--fix", ...files], {
  cwd: path.join(__dirname, "..", "frontend"),
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_OPTIONS: process.env.NODE_OPTIONS || "--max-old-space-size=8192",
  },
});

process.exit(result.status ?? 1);
