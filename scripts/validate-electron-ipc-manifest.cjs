/**
 * Bidirectional IPC contract check:
 * 1. Every manifest channel has ipcMain.handle in electron/
 * 2. Every preload ipcRenderer.invoke channel is in manifest (or mainOnly list)
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const manifestPath = path.join(root, "electron", "api-channels.manifest.json");
const preloadPath = path.join(root, "electron", "preload.js");
const electronDir = path.join(root, "electron");

function walkJs(dir, out = []) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) {
      if (name.name === "node_modules") continue;
      walkJs(p, out);
    } else if (name.isFile() && name.name.endsWith(".js")) {
      out.push(p);
    }
  }
  return out;
}

function extractPreloadInvokeChannels(preloadSource) {
  const re = /ipcRenderer\.invoke\("([^"]+)"/g;
  const out = new Set();
  let m;
  while ((m = re.exec(preloadSource)) !== null) {
    out.add(m[1]);
  }
  return out;
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const channels = manifest.channels;
  const mainOnly = new Set(Array.isArray(manifest.mainOnly) ? manifest.mainOnly : []);

  if (!Array.isArray(channels) || channels.length === 0) {
    console.error("Manifest missing non-empty channels array");
    process.exit(1);
  }

  const files = walkJs(electronDir);
  const combined = files.map((f) => fs.readFileSync(f, "utf8")).join("\n");

  const missingHandlers = [];
  for (const ch of channels) {
    const direct = `ipcMain.handle("${ch}"`;
    const viaRegister = `register("${ch}"`;
    if (!combined.includes(direct) && !combined.includes(viaRegister)) {
      missingHandlers.push(ch);
    }
  }

  const preloadSource = fs.readFileSync(preloadPath, "utf8");
  const preloadChannels = extractPreloadInvokeChannels(preloadSource);
  const manifestSet = new Set(channels);

  const missingFromManifest = [];
  for (const ch of preloadChannels) {
    if (!manifestSet.has(ch) && !mainOnly.has(ch)) {
      missingFromManifest.push(ch);
    }
  }

  const orphanManifest = [];
  for (const ch of channels) {
    if (!preloadChannels.has(ch) && !mainOnly.has(ch)) {
      orphanManifest.push(ch);
    }
  }

  let failed = false;
  if (missingHandlers.length) {
    failed = true;
    console.error("IPC manifest channels missing ipcMain.handle in electron/:");
    for (const m of missingHandlers) console.error("  -", m);
  }
  if (missingFromManifest.length) {
    failed = true;
    console.error("preload.js invoke channels missing from manifest (add to channels or mainOnly):");
    for (const m of missingFromManifest) console.error("  -", m);
  }
  if (orphanManifest.length) {
    console.warn("Manifest channels not used in preload (ok if deprecated or mainOnly):");
    for (const m of orphanManifest) console.warn("  -", m);
  }

  if (failed) process.exit(1);

  console.log(
    "IPC manifest OK:",
    channels.length,
    "channels;",
    preloadChannels.size,
    "preload invoke channels",
  );
}

main();
