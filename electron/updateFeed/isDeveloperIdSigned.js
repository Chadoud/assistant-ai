const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

/**
 * True when the running .app (or given path) is Developer ID Application–signed.
 * Non-darwin / missing path → false. Failures → false (fail closed for self-update).
 * @param {{ appPath?: string, codesignOutput?: string }} [opts]
 */
function isDeveloperIdSigned(opts = {}) {
  if (typeof opts.codesignOutput === "string") {
    return /Authority=Developer ID Application:/m.test(opts.codesignOutput);
  }

  if (process.platform !== "darwin") {
    return false;
  }

  let appPath = opts.appPath;
  if (!appPath) {
    try {
      const { app } = require("electron");
      const exe = app.getPath("exe");
      // .../Exo.app/Contents/MacOS/Exo → Exo.app
      const macosDir = path.dirname(exe);
      const contentsDir = path.dirname(macosDir);
      const candidate = path.dirname(contentsDir);
      if (candidate.endsWith(".app") && fs.existsSync(candidate)) {
        appPath = candidate;
      }
    } catch {
      return false;
    }
  }

  if (!appPath || !fs.existsSync(appPath)) {
    return false;
  }

  const r = spawnSync("codesign", ["-dv", "--verbose=2", appPath], {
    encoding: "utf8",
    timeout: 10_000,
  });
  const combined = `${r.stdout || ""}${r.stderr || ""}`;
  return /Authority=Developer ID Application:/m.test(combined);
}

module.exports = { isDeveloperIdSigned };
