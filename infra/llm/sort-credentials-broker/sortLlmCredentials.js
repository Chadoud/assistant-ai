/**
 * Mint short-lived LiteLLM virtual keys against the colocated gateway.
 */

const { buildSortAdmissionPolicyAsync } = require("./sortAdmissionPolicy");
const { buildSortCredentialsPublicConfig } = require("./sortCredentialsConfig");

function env(name, fallback = "") {
  const v = process.env[name];
  return v !== undefined && String(v).trim() !== "" ? String(v).trim() : fallback;
}

function envInt(name, fallback) {
  const n = Number.parseInt(env(name, String(fallback)), 10);
  return Number.isFinite(n) ? n : fallback;
}

function liteLlmDuration(ttlSeconds) {
  const hours = Math.max(1, Math.ceil(ttlSeconds / 3600));
  if (hours >= 24 && hours % 24 === 0) {
    return `${hours / 24}d`;
  }
  return `${hours}h`;
}

/**
 * @param {string} accountId
 */
async function issueSortLlmCredentials(accountId) {
  const internalBase = env("LITELLM_INTERNAL_URL", "http://litellm:4000").replace(/\/$/, "");
  const publicEndpoint = env("SORT_LLM_PUBLIC_URL", env("SORT_LLM_BASE_URL", "https://llm-staging.exosites.ch")).replace(
    /\/$/,
    ""
  );
  const masterKey = env("LITELLM_MASTER_KEY");
  const ttlSeconds = envInt("SORT_LLM_TOKEN_TTL_SECONDS", 86_400);
  const models = env("SORT_LLM_MODELS", "mistral,nomic-embed-text,moondream")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const maxParallel = envInt("SORT_LLM_MAX_PARALLEL", 2);
  const admission = await buildSortAdmissionPolicyAsync(maxParallel);

  if (!masterKey) {
    const err = new Error("sort_llm_not_configured");
    err.status = 503;
    throw err;
  }

  const alias = `exo-${String(accountId).slice(0, 8)}-${Date.now()}`;
  const url = `${internalBase}/key/generate`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${masterKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      key_alias: alias,
      duration: liteLlmDuration(ttlSeconds),
      models,
      max_parallel_requests: maxParallel,
    }),
    signal: AbortSignal.timeout(20_000),
  });

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }

  if (!res.ok) {
    const err = new Error(
      typeof data?.error === "string"
        ? data.error
        : data?.detail || `sort_key_generate_failed_${res.status}`
    );
    err.status = res.status >= 500 ? 503 : 502;
    throw err;
  }

  const token =
    (typeof data.key === "string" && data.key) ||
    (typeof data.token === "string" && data.token) ||
    (typeof data?.key_info?.key === "string" && data.key_info.key);

  if (!token) {
    const err = new Error("sort_key_generate_empty");
    err.status = 502;
    throw err;
  }

  const publicConfig = buildSortCredentialsPublicConfig();

  return {
    endpoint: publicEndpoint,
    token,
    expires_in: ttlSeconds,
    models,
    sort_service_mode: publicConfig.sort_service_mode,
    sort_worker_url: publicConfig.sort_worker_url,
    credentials_config_revision: publicConfig.credentials_config_revision,
    ...admission,
  };
}

module.exports = { issueSortLlmCredentials, buildSortCredentialsPublicConfig };
