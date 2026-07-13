const crypto = require("crypto");
const os = require("os");

/**
 * Stable device fingerprint (hex sha256). Must match backend `machine_fingerprint()`.
 * Used in signed licenses so one key = one machine (offline).
 */
function normalizeArch(a) {
  const s = String(a || "").toLowerCase();
  if (s === "amd64") return "x64";
  return s;
}

function normalizePlatform(p) {
  return String(p || "").toLowerCase();
}

function getMachineFingerprint() {
  const blob = JSON.stringify({
    a: normalizeArch(os.arch()),
    h: String(os.hostname() || "").toLowerCase(),
    p: normalizePlatform(os.platform()),
  });
  return crypto.createHash("sha256").update(blob, "utf8").digest("hex");
}

module.exports = { getMachineFingerprint };
