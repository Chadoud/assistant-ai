/**
 * Ensure preload.js API surface keys are declared on ElectronAPI in electron.d.ts.
 * Complements validate-electron-ipc-manifest.cjs (channels ↔ handlers).
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const preloadPath = path.join(root, "electron", "preload.js");
const dtsPath = path.join(root, "frontend", "src", "types", "electron.d.ts");

function extractPreloadApiKeys(source) {
  const marker = 'exposeInMainWorld("electronAPI"';
  const start = source.indexOf(marker);
  if (start === -1) {
    console.error("Could not find electronAPI expose block in preload.js");
    process.exit(1);
  }
  const braceStart = source.indexOf("{", start);
  let depth = 0;
  const keys = new Set();
  let lineStart = braceStart + 1;

  for (let i = braceStart; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) break;
    } else if (depth === 1 && ch === "\n") {
      const line = source.slice(lineStart, i);
      const m = line.match(/^\s*(\w+)\s*:/);
      if (m) keys.add(m[1]);
      lineStart = i + 1;
    }
  }
  return keys;
}

function main() {
  const preloadSource = fs.readFileSync(preloadPath, "utf8");
  const dtsSource = fs.readFileSync(dtsPath, "utf8");

  const apiMatch = dtsSource.match(/export interface ElectronAPI\s*\{([\s\S]*?)\n\}/);
  if (!apiMatch) {
    console.error("Could not find ElectronAPI interface in electron.d.ts");
    process.exit(1);
  }
  const dtsBlock = apiMatch[1];

  const preloadKeys = extractPreloadApiKeys(preloadSource);
  const missing = [];
  for (const key of preloadKeys) {
    const optional = `${key}?:`;
    const required = `${key}:`;
    if (!dtsBlock.includes(optional) && !dtsBlock.includes(required)) {
      missing.push(key);
    }
  }

  if (missing.length) {
    console.error("electron.d.ts ElectronAPI missing preload keys:");
    for (const k of missing.sort()) console.error("  -", k);
    process.exit(1);
  }

  console.log(`electron.d.ts OK: ${preloadKeys.size} preload API keys declared`);
}

main();
