/** Pure Ollama helper functions — no side effects, no window access. */

const path = require("path");
const os = require("os");
const fs = require("fs");
const http = require("http");
const { spawn, spawnSync } = require("child_process");
const {
  IS_WIN,
  OLLAMA_PORT,
  DEFAULT_SETUP_MODEL,
  OLLAMA_TAGS_TIMEOUT_MS,
  OLLAMA_READY_POLL_MAX,
  POLL_INTERVAL_MS,
} = require("./constants");
const { delay } = require("./utils");

function ollamaCandidatePaths() {
  return IS_WIN
    ? [
        path.join(os.homedir(), "AppData", "Local", "Programs", "Ollama", "ollama.exe"),
        "C:\\Program Files\\Ollama\\ollama.exe",
        "C:\\Program Files (x86)\\Ollama\\ollama.exe",
      ]
    : [
        "/usr/local/bin/ollama",
        "/opt/homebrew/bin/ollama",
        path.join(os.homedir(), "Applications", "Ollama.app", "Contents", "MacOS", "ollama"),
        "/usr/bin/ollama",
      ];
}

/** First known install path, or `null` (caller may fall back to `ollama` on PATH). */
function getOllamaExecutablePath() {
  for (const loc of ollamaCandidatePaths()) {
    if (fs.existsSync(loc)) return loc;
  }
  return null;
}

function isOllamaInstalled() {
  if (getOllamaExecutablePath()) return true;
  try {
    const result = spawnSync("ollama", ["--version"], {
      shell: false,
      timeout: 3000,
      windowsHide: true,
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Fetch the Ollama /api/tags endpoint and return the parsed models array, or null on error.
 * @param {number} [timeoutMs]
 */
function fetchOllamaTags(timeoutMs = OLLAMA_TAGS_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${OLLAMA_PORT}/api/tags`, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          resolve(Array.isArray(json.models) ? json.models : null);
        } catch {
          resolve(null);
        }
      });
    });
    req.on("error", () => resolve(null));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(null);
    });
  });
}

async function isOllamaRunning() {
  const models = await fetchOllamaTags();
  return models !== null;
}

async function isModelPulled() {
  const models = await fetchOllamaTags(OLLAMA_TAGS_TIMEOUT_MS * 1.5);
  if (!models) return false;
  return models.some((m) => m.name?.startsWith(DEFAULT_SETUP_MODEL));
}

/**
 * Start `ollama serve` detached, with no extra console on Windows.
 * Important: never use `shell: true` here — that spawns cmd.exe and often shows a black window
 * even with `windowsHide`. Prefer the real `ollama.exe` path + `shell: false`.
 */
function spawnOllamaServeDetached() {
  const resolved = getOllamaExecutablePath();
  const command = resolved ?? "ollama";
  return spawn(command, ["serve"], {
    detached: true,
    shell: false,
    stdio: "ignore",
    windowsHide: true,
  });
}

/**
 * Start `ollama serve` silently in the background if Ollama is installed but
 * not yet responding. Returns true once the service is ready (or was already
 * running), false if it could not be started within the timeout.
 */
async function ensureOllamaRunning() {
  if (isRemoteOllamaMode()) {
    console.log("[ollama] Remote LLM mode — skipping local ollama serve.");
    return true;
  }
  if (!(isOllamaInstalled())) return false;
  if (await isOllamaRunning()) return true;

  console.log("[ollama] Service not running — starting ollama serve...");
  const proc = spawnOllamaServeDetached();
  proc.unref();

  // Poll up to 15 seconds for Ollama to become ready
  for (let i = 0; i < OLLAMA_READY_POLL_MAX; i++) {
    await delay(POLL_INTERVAL_MS);
    if (await isOllamaRunning()) {
      console.log("[ollama] Service is ready.");
      return true;
    }
  }
  console.warn("[ollama] Service did not respond within 15 s.");
  return false;
}

/**
 * True when file sorting should not install, start, or require local ``ollama serve``.
 * Includes packaged cloud builds (sign-in gate) and persisted cloud sort credentials.
 */
function isRemoteOllamaMode() {
  const mode = String(process.env.OLLAMA_MODE || "remote").trim().toLowerCase();
  if (mode === "local") return false;
  if (mode === "remote") return true;
  if (String(process.env.EXOSITES_REMOTE_LLM || "").trim() === "1") return true;

  try {
    const { readBackendEnvOverridesRaw } = require("./backendEnvOverrides");
    const raw = readBackendEnvOverridesRaw();
    const managed =
      raw.EXOSITES_SORT_CREDENTIALS_MANAGED === "1" ||
      raw.EXOSITES_SORT_CREDENTIALS_MANAGED === 1;
    if (managed) return true;
    if (String(raw.OLLAMA_MODE || "remote").trim().toLowerCase() === "remote") return true;
    if (String(raw.OLLAMA_MODE || "").trim().toLowerCase() === "local") return false;
  } catch {
    /* userData not ready yet */
  }

  try {
    const cloudAuth = require("./cloudAuth");
    if (cloudAuth.isAuthGateEnabled()) return true;
  } catch {
    /* ignore */
  }

  // Default: cloud LLM (Exo VPS). See docs/CLOUD_LLM_ONLY.md.
  return true;
}

module.exports = {
  isOllamaInstalled,
  isOllamaRunning,
  isModelPulled,
  ensureOllamaRunning,
  fetchOllamaTags,
  getOllamaExecutablePath,
  spawnOllamaServeDetached,
  isRemoteOllamaMode,
};
