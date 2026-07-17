/** Optional env vars merged into the Python backend child process (userData JSON file). */

const fs = require("fs");
const path = require("path");
const { app } = require("electron");

const FILE_NAME = "backend-env-overrides.json";

function overridesPath() {
  return path.join(require("./accountProfile").resolveProfileRoot(), FILE_NAME);
}

/** Read persisted overrides; values become strings on the backend env. */
/** Raw JSON as stored (for Settings UI). */
function readBackendEnvOverridesRaw() {
  const p = overridesPath();
  try {
    if (!fs.existsSync(p)) return {};
    const o = JSON.parse(fs.readFileSync(p, "utf8"));
    if (!o || typeof o !== "object" || Array.isArray(o)) return {};
    return o;
  } catch (e) {
    console.warn("[backendEnvOverrides] read raw failed:", e.message);
    return {};
  }
}

/** Flatten values for process.env (child process). */
function readBackendEnvOverrides() {
  const o = readBackendEnvOverridesRaw();
  const env = {};
  for (const [k, v] of Object.entries(o)) {
    if (typeof k !== "string" || !k.trim()) continue;
    if (v === null || v === undefined || v === "") continue;
    if (typeof v === "boolean") env[k] = v ? "1" : "0";
    else env[k] = String(v);
  }
  return env;
}

function writeBackendEnvOverrides(obj) {
  const p = overridesPath();
  if (!obj || typeof obj !== "object") {
    if (fs.existsSync(p)) fs.unlinkSync(p);
    return { ok: true };
  }
  const cleaned = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof k !== "string" || !k.trim()) continue;
    if (v === null || v === undefined || v === "") continue;
    cleaned[k.trim()] = v;
  }
  if (Object.keys(cleaned).length === 0) {
    if (fs.existsSync(p)) fs.unlinkSync(p);
    return { ok: true };
  }
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(cleaned, null, 2), "utf8");
  return { ok: true };
}

module.exports = {
  readBackendEnvOverrides,
  readBackendEnvOverridesRaw,
  writeBackendEnvOverrides,
  overridesPath,
};
