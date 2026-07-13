const path = require("path");

const ENV_PATH = path.join(__dirname, "..", ".env");

/**
 * @param {string} name
 * @param {string | undefined} fallback
 */
function env(name, fallback = "") {
  const v = process.env[name];
  return v !== undefined && String(v).trim() !== "" ? String(v).trim() : fallback;
}

function envInt(name, fallback) {
  const n = Number.parseInt(env(name, String(fallback)), 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Reload cloud-node/.env over process env (Infomaniak Manager vars) before sort credential minting.
 * Ensures SORT_LLM_ALLOW_MASTER_DELEGATION=0 on disk takes effect without a panel restart.
 */
function reloadSortLlmEnvFromDisk() {
  if (env("NODE_ENV", "development") !== "production") return;
  require("dotenv").config({ path: ENV_PATH, override: true });
}

/**
 * Fresh sort LLM settings after disk reload — used by credentials + /health mode reporting.
 */
function getSortLlmRuntimeConfig() {
  reloadSortLlmEnvFromDisk();
  return {
    baseUrl: env("SORT_LLM_BASE_URL", "https://llm-staging.exosites.ch"),
    masterKey: env("LITELLM_MASTER_KEY"),
    tokenTtlSeconds: envInt("SORT_LLM_TOKEN_TTL_SECONDS", 86_400),
    maxParallelRequests: envInt("SORT_LLM_MAX_PARALLEL", 2),
    models: env("SORT_LLM_MODELS", "mistral,nomic-embed-text,moondream")
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean),
    allowMasterDelegation: env("SORT_LLM_ALLOW_MASTER_DELEGATION", "0") === "1",
    mockToken: env("SORT_LLM_MOCK_TOKEN"),
  };
}

module.exports = { getSortLlmRuntimeConfig, reloadSortLlmEnvFromDisk };
