const { getSortLlmRuntimeConfig } = require("./sortLlmRuntimeConfig");
const { buildSortAdmissionPolicyAsync } = require("./sortAdmissionPolicy");

const DEFAULT_MODELS = ["mistral", "nomic-embed-text"];

/**
 * Map configured TTL seconds to a LiteLLM key duration string.
 * @param {number} ttlSeconds
 */
function liteLlmDuration(ttlSeconds) {
  const hours = Math.max(1, Math.ceil(ttlSeconds / 3600));
  if (hours >= 24 && hours % 24 === 0) {
    return `${hours / 24}d`;
  }
  return `${hours}h`;
}

/**
 * Mint a short-lived LiteLLM virtual key for an entitled account.
 * @param {string} accountId
 * @returns {Promise<{ endpoint: string; token: string; expires_in: number; models: string[] }>}
 */
async function issueSortLlmCredentials(accountId) {
  const sortLlm = getSortLlmRuntimeConfig();
  const endpoint = sortLlm.baseUrl.replace(/\/$/, "");
  const ttlSeconds = sortLlm.tokenTtlSeconds;
  const models = sortLlm.models;
  const admission = await buildSortAdmissionPolicyAsync(sortLlm.maxParallelRequests);

  if (sortLlm.mockToken) {
    return {
      endpoint,
      token: sortLlm.mockToken,
      expires_in: ttlSeconds,
      models,
      ...admission,
    };
  }

  const masterKey = sortLlm.masterKey;
  if (!masterKey) {
    const err = new Error("sort_llm_not_configured");
    err.status = 503;
    throw err;
  }

  if (sortLlm.allowMasterDelegation) {
    return {
      endpoint,
      token: masterKey,
      expires_in: ttlSeconds,
      models,
      ...admission,
    };
  }

  const alias = `exo-${String(accountId).slice(0, 8)}-${Date.now()}`;
  const url = `${endpoint}/key/generate`;
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
      max_parallel_requests: sortLlm.maxParallelRequests,
    }),
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
        : data?.detail || `sort_key_generate_failed_${res.status}`,
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

  return {
    endpoint,
    token,
    expires_in: ttlSeconds,
    models,
    ...admission,
  };
}

module.exports = { issueSortLlmCredentials, liteLlmDuration, DEFAULT_MODELS };
