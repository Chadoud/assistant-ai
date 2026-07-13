/**
 * Build electron/assets/icon.icns from electron/assets/icon.png (macOS packaging).
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PNG = path.join(ROOT, "electron", "assets", "icon.png");
const ICNS = path.join(ROOT, "electron", "assets", "icon.icns");
const ICONSET = path.join(require("os").tmpdir(), "exosites-icon.iconset");

if (!fs.existsSync(PNG)) {
  console.error("Missing electron/assets/icon.png");
  process.exit(1);
}

if (process.platform !== "darwin") {
  console.warn("generate-mac-icns: skipping (requires macOS iconutil/sips)");
  process.exit(0);
}

fs.rmSync(ICONSET, { recursive: true, force: true });
fs.mkdirSync(ICONSET, { recursive: true });

const sizes = [
  ["16", "icon_16x16.png"],
  ["32", "icon_16x16@2x.png"],
  ["32", "icon_32x32.png"],
  ["64", "icon_32x32@2x.png"],
  ["128", "icon_128x128.png"],
  ["256", "icon_128x128@2x.png"],
  ["256", "icon_256x256.png"],
  ["512", "icon_256x256@2x.png"],
  ["512", "icon_512x512.png"],
];

for (const [dim, name] of sizes) {
  execSync(`sips -z ${dim} ${dim} "${PNG}" --out "${path.join(ICONSET, name)}"`, {
    stdio: "inherit",
  });
}
fs.copyFileSync(PNG, path.join(ICONSET, "icon_512x512@2x.png"));
execSync(`iconutil -c icns "${ICONSET}" -o "${ICNS}"`, { stdio: "inherit" });
fs.rmSync(ICONSET, { recursive: true, force: true });
console.log("Wrote", ICNS);
