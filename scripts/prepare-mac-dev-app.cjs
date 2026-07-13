/**
 * macOS only: copy Electron.app, set Dock name + icon (EXO), strip quarantine.
 * Enables correct Dock tooltip + icon in dev (npm run dev / start-dev.sh).
 * Uses ELECTRON_OVERRIDE_DIST_PATH — see node_modules/electron/index.js
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");
const devMac = path.join(root, "electron", "dev-macos");
const targetApp = path.join(devMac, "Electron.app");
const srcApp = path.join(root, "node_modules", "electron", "dist", "Electron.app");
const stampPath = path.join(devMac, ".electron-version");

function electronVersion() {
  const j = JSON.parse(fs.readFileSync(path.join(root, "node_modules", "electron", "package.json"), "utf8"));
  return j.version;
}

function iconStamp() {
  const p = path.join(root, "electron", "assets", "icon.png");
  if (!fs.existsSync(p)) return "";
  return String(fs.statSync(p).mtimeMs);
}

function stampKey() {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const productName = pkg.build?.productName ?? "Exo";
  return `${electronVersion()}\n${productName}\n${iconStamp()}`;
}

function needsRefresh() {
  if (!fs.existsSync(targetApp)) return true;
  if (!fs.existsSync(stampPath)) return true;
  const v = fs.readFileSync(stampPath, "utf8").trim();
  return v !== stampKey();
}

function buildIcns() {
  execSync(`node "${path.join(__dirname, "generate-mac-icns.js")}"`, { cwd: root, stdio: "inherit" });
  const icnsOut = path.join(root, "electron", "assets", "icon.icns");
  if (!fs.existsSync(icnsOut)) {
    throw new Error("icon.icns was not generated");
  }
  return icnsOut;
}

function main() {
  if (process.platform !== "darwin") {
    return;
  }
  if (!fs.existsSync(srcApp)) {
    console.warn("prepare-mac-dev-app: node_modules/electron/dist/Electron.app not found; skip.");
    return;
  }

  execSync(`node "${path.join(__dirname, "render-icon.cjs")}"`, { cwd: root, stdio: "inherit" });

  if (!needsRefresh()) {
    console.log("electron/dev-macos/Electron.app is up to date.");
    return;
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const productName = pkg.build?.productName ?? "Exo";

  console.log("Preparing branded Electron.app for macOS dev (Dock name + icon)…");
  fs.rmSync(devMac, { recursive: true, force: true });
  fs.mkdirSync(devMac, { recursive: true });
  fs.mkdirSync(targetApp, { recursive: true });
  execSync(`rsync -a --delete "${srcApp}/" "${targetApp}/"`, { stdio: "inherit" });

  const plist = path.join(targetApp, "Contents", "Info.plist");
  execSync(`plutil -replace CFBundleDisplayName -string "${productName}" "${plist}"`, { stdio: "inherit" });
  execSync(`plutil -replace CFBundleName -string "${productName}" "${plist}"`, { stdio: "inherit" });

  const icns = buildIcns();
  const resDir = path.join(targetApp, "Contents", "Resources");
  fs.copyFileSync(icns, path.join(resDir, "icon.icns"));
  execSync(`plutil -replace CFBundleIconFile -string "icon" "${plist}"`, { stdio: "inherit" });

  try {
    execSync(`xattr -cr "${targetApp}"`, { stdio: "inherit" });
  } catch (_) { /* ignore */ }

  fs.writeFileSync(stampPath, stampKey(), "utf8");
  console.log(`Done. Dock will show "${productName}" when using ELECTRON_OVERRIDE_DIST_PATH.`);
}

main();
