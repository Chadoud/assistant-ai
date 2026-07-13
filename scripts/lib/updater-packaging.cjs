/**
 * electron-updater must ship inside app.asar for macOS in-app updates.
 * package.json excludes all of node_modules by default; these globs re-include
 * electron-updater and its runtime dependency tree.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const NODE_MODULES = path.join(ROOT, "node_modules");

/** @returns {string[]} */
function updaterRuntimePackageNames() {
  if (!fs.existsSync(NODE_MODULES)) return ["electron-updater"];

  /** @param {string} name @param {string} fromDir @returns {string | null} */
  function resolvePkgDir(name, fromDir) {
    try {
      return path.dirname(require.resolve(`${name}/package.json`, { paths: [fromDir] }));
    } catch {
      return null;
    }
  }

  const seen = new Set();
  const queue = ["electron-updater"];

  while (queue.length) {
    const name = queue.shift();
    if (seen.has(name)) continue;
    const dir = resolvePkgDir(name, NODE_MODULES);
    if (!dir) continue;
    seen.add(name);
    const pkgJson = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    const deps = { ...pkgJson.dependencies, ...pkgJson.optionalDependencies };
    for (const dep of Object.keys(deps || {})) queue.push(dep);
  }

  return [...seen].sort();
}

/** @returns {string[]} */
function updaterAsarFileGlobs() {
  return updaterRuntimePackageNames().map((name) => `node_modules/${name}/**/*`);
}

/**
 * @param {string} asarPath
 * @returns {boolean}
 */
function verifyElectronUpdaterInAsar(asarPath) {
  if (!fs.existsSync(asarPath)) {
    console.error(`[updater-packaging] app.asar not found: ${asarPath}`);
    return false;
  }

  let listOutput;
  try {
    listOutput = require("child_process").execSync(`npx --yes asar list "${asarPath}"`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    console.error("[updater-packaging] failed to read app.asar:", err.message);
    return false;
  }

  const hasUpdaterMain = listOutput.split("\n").some((line) => /\/node_modules\/electron-updater\//.test(line));
  if (!hasUpdaterMain) {
    console.error("[updater-packaging] electron-updater missing from app.asar — in-app updates will fall back to DMG");
    return false;
  }

  console.log("[updater-packaging] OK electron-updater bundled in app.asar");
  return true;
}

/**
 * Ensure mac electron-builder config merges updater globs into `files`.
 * @returns {boolean}
 */
function verifyUpdaterPackagingConfig() {
  const { electronBuilderConfig } = require("./mac-packaging.cjs");
  const files = electronBuilderConfig().files || [];
  const hasUpdaterGlob = files.some(
    (entry) => typeof entry === "string" && entry.includes("node_modules/electron-updater/")
  );
  if (!hasUpdaterGlob) {
    console.error("[updater-packaging] mac electron-builder files[] missing electron-updater glob");
    return false;
  }
  console.log("[updater-packaging] OK electron-builder files include electron-updater");
  return true;
}

module.exports = {
  updaterRuntimePackageNames,
  updaterAsarFileGlobs,
  verifyElectronUpdaterInAsar,
  verifyUpdaterPackagingConfig,
};
