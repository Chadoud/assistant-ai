#!/usr/bin/env node
/**
 * Remove stale installer artifacts from dist-installer/.
 * Keeps current package version + primary DMG aliases; deletes old zips, blockmaps, debug yaml.
 *
 * Usage: node scripts/clean-dist-installer.cjs [--all]
 *   --all  also remove unpacked mac/ folders and Windows installer
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist-installer");
const pkg = require(path.join(ROOT, "package.json"));
const version = pkg.version;
const wipeAll = process.argv.includes("--all");

if (!fs.existsSync(DIST)) {
  console.log("[clean-dist-installer] dist-installer/ does not exist — nothing to do");
  process.exit(0);
}

/** @param {string} name */
function shouldKeepFile(name) {
  if (name === "latest-mac.yml") return true;
  if (name === "Exo.dmg") return true;
  if (/^Exo-(x64|arm64|universal)\.dmg$/i.test(name)) return true;
  if (name === `Exo-${version}-mac.zip`) return true;
  if (name === `Exo-${version}-universal-mac.zip`) return true;
  return false;
}

let removed = 0;
let bytes = 0;

for (const name of fs.readdirSync(DIST)) {
  const full = path.join(DIST, name);
  if (name.endsWith(".blockmap")) {
    /* always remove — regenerated each build */
  } else if (name.startsWith("builder-") && name.endsWith(".yaml")) {
    /* debug artifacts */
  } else if (name === "Exo Setup.exe" && !wipeAll) {
    continue;
  } else if (shouldKeepFile(name)) {
    continue;
  } else if (wipeAll && (name === "mac" || name === "mac-universal" || name.startsWith("mac-"))) {
    fs.rmSync(full, { recursive: true, force: true });
    console.log(`[clean-dist-installer] removed dir ${name}/`);
    removed += 1;
    continue;
  } else if (!wipeAll && (name === "mac" || name === "mac-universal")) {
    continue;
  } else {
    /* old version zips, stale dmgs, .DS_Store, etc. */
  }

  if (!fs.existsSync(full)) continue;
  const stat = fs.statSync(full);
  if (stat.isDirectory()) {
    fs.rmSync(full, { recursive: true, force: true });
    console.log(`[clean-dist-installer] removed dir ${name}/`);
  } else {
    bytes += stat.size;
    fs.unlinkSync(full);
    console.log(`[clean-dist-installer] removed ${name}`);
  }
  removed += 1;
}

const mb = (bytes / (1024 * 1024)).toFixed(1);
console.log(`[clean-dist-installer] done — ${removed} item(s), ~${mb} MB freed (kept v${version} artifacts)`);
