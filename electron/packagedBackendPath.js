/**
 * Resolve the packaged PyInstaller backend for the current OS/arch.
 *
 * PyInstaller one-file binaries cannot be merged with `lipo` — the outer Mach-O
 * becomes universal but the embedded Python runtime stays single-arch. Universal
 * macOS builds ship `backend-x64` and `backend-arm64` side by side instead.
 */

const fs = require("fs");
const path = require("path");

/**
 * @param {string} resourcesPath Electron `process.resourcesPath`
 * @param {NodeJS.Platform} [platform]
 * @param {string} [arch] process.arch
 * @returns {string | null} Absolute path to the backend executable, or null if missing.
 */
function resolvePackagedBackendBin(resourcesPath, platform = process.platform, arch = process.arch) {
  if (!resourcesPath) return null;

  if (platform === "win32") {
    const winBin = path.join(resourcesPath, "backend.exe");
    return fs.existsSync(winBin) ? winBin : null;
  }

  if (platform === "darwin") {
    const sliceName = arch === "arm64" ? "backend-arm64" : "backend-x64";
    const sliced = path.join(resourcesPath, sliceName);
    if (fs.existsSync(sliced)) return sliced;

    const legacy = path.join(resourcesPath, "backend");
    return fs.existsSync(legacy) ? legacy : null;
  }

  const linuxBin = path.join(resourcesPath, "backend");
  return fs.existsSync(linuxBin) ? linuxBin : null;
}

module.exports = { resolvePackagedBackendBin };
