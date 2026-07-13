/**
 * Inject chat-provider API keys into the Python backend at spawn from safeStorage.
 */

const fs = require("fs");
const path = require("path");
const { getSecret, setSecret, clearSecret } = require("./secretsStore");
const { parseDotenvFile } = require("./readGmailDotenvForBackend");

/** safeStorage key → backend env var (matches frontend secretsStorage.ts). */
const PROVIDER_ENV_BY_SECRET_KEY = [
  ["geminiApiKey", "GEMINI_API_KEY"],
  ["chatProvider.openai.apiKey", "OPENAI_API_KEY"],
  ["chatProvider.anthropic.apiKey", "ANTHROPIC_API_KEY"],
  ["chatProvider.custom.apiKey", "CUSTOM_API_KEY"],
];

const MANUAL_REMOTE_LLM_SECRET = "remote_llm.ollama_api_key";

const AI_KEY_ENV_VARS = new Set(PROVIDER_ENV_BY_SECRET_KEY.map(([, envKey]) => envKey));

const WRITABLE_ENV_AI_KEYS = new Set([
  ...AI_KEY_ENV_VARS,
  "CUSTOM_BASE_URL",
  "GEMINI_CHAT_MODEL",
]);

function getManualRemoteLlmApiKey() {
  return getSecret(MANUAL_REMOTE_LLM_SECRET) || "";
}

/**
 * @param {string} apiKey
 * @returns {{ ok: true } | { ok: false; reason: string }}
 */
function setManualRemoteLlmApiKey(apiKey) {
  const value = String(apiKey || "").trim();
  if (!value) {
    clearSecret(MANUAL_REMOTE_LLM_SECRET);
    return { ok: true };
  }
  return setSecret(MANUAL_REMOTE_LLM_SECRET, value);
}

/** Build env fragment for backend child process spawn. */
function readAiProviderEnvForBackendSpawn() {
  const out = {};
  for (const [secretKey, envKey] of PROVIDER_ENV_BY_SECRET_KEY) {
    const value = getSecret(secretKey);
    if (value && value.trim()) out[envKey] = value.trim();
  }
  return out;
}

/**
 * Strip provider API keys from a userData `.env` file after migrating to safeStorage.
 * @param {string} envPath
 */
function stripAiKeysFromEnvFile(envPath) {
  if (!envPath || !fs.existsSync(envPath)) return;
  let lines;
  try {
    lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  } catch {
    return;
  }
  const out = [];
  let changed = false;
  for (const line of lines) {
    const trimmed = line.trim();
    const eq = trimmed.indexOf("=");
    if (eq > 0) {
      const key = trimmed.slice(0, eq).replace(/^export\s+/i, "").trim();
      if (WRITABLE_ENV_AI_KEYS.has(key)) {
        changed = true;
        continue;
      }
    }
    out.push(line);
  }
  if (!changed) return;
  try {
    fs.writeFileSync(envPath, out.join("\n").replace(/\n+$/, "") + (out.length ? "\n" : ""), "utf8");
    fs.chmodSync(envPath, 0o600);
  } catch {
    /* non-fatal */
  }
}

/**
 * Migrate plaintext AI keys from userData `.env` into safeStorage.
 * @param {string | undefined} userData
 */
function migrateAiKeysFromWritableEnv(userData) {
  if (!userData) return { migrated: false };
  const envPath = path.join(userData, ".env");
  const parsed = parseDotenvFile(envPath, WRITABLE_ENV_AI_KEYS);
  let migrated = false;
  for (const [secretKey, envKey] of PROVIDER_ENV_BY_SECRET_KEY) {
    const legacy = String(parsed[envKey] || "").trim();
    if (!legacy) continue;
    if (!getSecret(secretKey)) {
      setSecret(secretKey, legacy);
    }
    migrated = true;
  }
  if (migrated) stripAiKeysFromEnvFile(envPath);
  return { migrated };
}

module.exports = {
  PROVIDER_ENV_BY_SECRET_KEY,
  MANUAL_REMOTE_LLM_SECRET,
  AI_KEY_ENV_VARS,
  getManualRemoteLlmApiKey,
  setManualRemoteLlmApiKey,
  readAiProviderEnvForBackendSpawn,
  migrateAiKeysFromWritableEnv,
  stripAiKeysFromEnvFile,
};
