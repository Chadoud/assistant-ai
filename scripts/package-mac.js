/**
 * macOS packager — native Exo-{arm64|x64}.dmg or universal Exo-universal.dmg.
 *
 * Prerequisites (see build-mac-release.sh):
 *   npm run build:frontend
 *   PyInstaller backend → electron/resources/backend-{arch}
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { resolvePackagedBackendBin } = require("../electron/packagedBackendPath");
const {
  hostNativeArch,
  isUniversalBuild,
  packagingMode,
  stageBackendSlices,
  copyPrimaryDmgAlias,
} = require("./lib/mac-packaging.cjs");

if (process.platform !== "darwin") {
  console.error("Error: package:mac must be run on a Mac.");
  console.error("Use npm run package:win on Windows instead.");
  process.exit(1);
}

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist-installer");
const RESOURCES = path.join(ROOT, "electron", "resources");

/** dmg-builder runs `which python`; macOS often only has python3 on PATH in non-interactive shells. */
function pythonShimDir() {
  const dir = path.join(ROOT, ".build-shims");
  fs.mkdirSync(dir, { recursive: true });
  const shim = path.join(dir, "python");
  if (!fs.existsSync(shim)) {
    try {
      const python3 = execSync("command -v python3", { encoding: "utf8", shell: "/bin/bash" }).trim();
      if (python3) fs.symlinkSync(python3, shim);
    } catch {
      /* electron-builder will surface a clear error */
    }
  }
  return dir;
}

/** electron-builder wants "Name (TEAMID)" — not the full Keychain prefix. */
function normalizeMacSignIdentity(identity) {
  if (!identity) return undefined;
  return identity.replace(/^Developer ID Application:\s*/, "").trim();
}

execSync("bash scripts/prepare-release-resources.sh", { cwd: ROOT, stdio: "inherit" });
stageBackendSlices(RESOURCES);

const backendBin = resolvePackagedBackendBin(RESOURCES);
if (!backendBin || !fs.existsSync(backendBin)) {
  console.error("Error: packaged macOS backend slice not found under electron/resources/");
  console.error("Run: npm run build:mac");
  process.exit(1);
}

const frontendDist = path.join(ROOT, "frontend", "dist", "index.html");
if (!fs.existsSync(frontendDist)) {
  console.log("Frontend not built — building now...");
  execSync("npm run build:frontend", { cwd: ROOT, stdio: "inherit" });
}

const icnsPath = path.join(ROOT, "electron", "assets", "icon.icns");
if (!fs.existsSync(icnsPath)) {
  execSync("node scripts/generate-mac-icns.js", { cwd: ROOT, stdio: "inherit" });
}

const dmgBgPath = path.join(ROOT, "electron", "assets", "dmg-background.png");
if (!fs.existsSync(dmgBgPath)) {
  execSync("node scripts/generate-dmg-background.js", { cwd: ROOT, stdio: "inherit" });
}

const universal = isUniversalBuild();
const nativeArch = hostNativeArch();
const mode = packagingMode();
const hasSigningIdentity = Boolean(process.env.MAC_SIGN_IDENTITY || process.env.CSC_LINK || process.env.CSC_NAME);

console.log("\n=== Exo — macOS Packager ===\n");

const builderEnv = {
  ...process.env,
  EXO_MAC_UNIVERSAL: universal ? "1" : "0",
  PATH: `${pythonShimDir()}${path.delimiter}${process.env.PATH || ""}`,
  CSC_IDENTITY_AUTO_DISCOVERY: hasSigningIdentity ? "true" : "false",
};
if (process.env.MAC_SIGN_IDENTITY) {
  builderEnv.CSC_NAME = normalizeMacSignIdentity(process.env.MAC_SIGN_IDENTITY);
}

const builderArgs = ["--config electron-builder.mac.cjs", "--mac", "dmg", "zip", "--publish", "never"];
if (universal) {
  console.log("Building universal Exo-universal.dmg (Intel + Apple Silicon)...");
  builderArgs.push("--universal");
} else {
  console.log(`Building native Exo-${nativeArch}.dmg...`);
  builderArgs.push(`--${nativeArch}`);
}

execSync(`npx electron-builder ${builderArgs.join(" ")}`, {
  cwd: ROOT,
  stdio: "inherit",
  env: builderEnv,
});

copyPrimaryDmgAlias(DIST);

console.log("\nVerifying packaged app bundle...");
execSync("node scripts/verify-packaged-app.cjs", {
  cwd: ROOT,
  stdio: "inherit",
  env: { ...process.env, EXO_MAC_UNIVERSAL: universal ? "1" : "0" },
});

console.log("\n✓ Done!");
console.log(`Installers in: ${DIST}/`);
