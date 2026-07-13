/**
 * Cloud-managed sort LLM bearer token — safeStorage only (never backend-env-overrides JSON).
 */

const { getSecret, setSecret, clearSecret } = require("../secretsStore");
const { readBackendEnvOverridesRaw, writeBackendEnvOverrides } = require("../backendEnvOverrides");

const SECRET_KEY = "sort.llm_api_key";

function getCloudSortLlmApiKey() {
  return getSecret(SECRET_KEY) || "";
}

/**
 * @param {string} token
 * @returns {{ ok: true } | { ok: false; reason: string }}
 */
function setCloudSortLlmApiKey(token) {
  const value = String(token || "").trim();
  if (!value) {
    clearCloudSortLlmApiKey();
    return { ok: true };
  }
  return setSecret(SECRET_KEY, value);
}

function clearCloudSortLlmApiKey() {
  return clearSecret(SECRET_KEY);
}

/** One-time: move OLLAMA_API_KEY from overrides JSON into safeStorage (cloud-managed only). */
function migrateCloudSortKeyFromOverrides() {
  const raw = readBackendEnvOverridesRaw();
  const managed =
    raw.EXOSITES_SORT_CREDENTIALS_MANAGED === "1" ||
    raw.EXOSITES_SORT_CREDENTIALS_MANAGED === 1;
  if (!managed) return { migrated: false };
  const legacy = String(raw.OLLAMA_API_KEY || "").trim();
  if (!legacy) return { migrated: false };
  if (!getCloudSortLlmApiKey()) {
    setCloudSortLlmApiKey(legacy);
  }
  const next = { ...raw };
  delete next.OLLAMA_API_KEY;
  writeBackendEnvOverrides(next);
  return { migrated: true };
}

module.exports = {
  getCloudSortLlmApiKey,
  setCloudSortLlmApiKey,
  clearCloudSortLlmApiKey,
  migrateCloudSortKeyFromOverrides,
};
