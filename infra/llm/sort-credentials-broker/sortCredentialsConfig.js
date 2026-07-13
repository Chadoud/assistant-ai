/**
 * Public sort-credentials config + stable revision for desktop cache invalidation.
 */

const crypto = require("crypto");

function env(name, fallback = "") {
  const v = process.env[name];
  return v !== undefined && String(v).trim() !== "" ? String(v).trim() : fallback;
}

function envInt(name, fallback) {
  const n = Number.parseInt(env(name, String(fallback)), 10);
  return Number.isFinite(n) ? n : fallback;
}

function publicSortEndpoint() {
  return env("SORT_LLM_PUBLIC_URL", env("SORT_LLM_BASE_URL", "https://llm-staging.exosites.ch")).replace(
    /\/$/,
    ""
  );
}

/**
 * Stable revision when broker env changes (no secrets in hash input).
 */
function buildCredentialsConfigRevision(fields) {
  const payload = [
    fields.sort_service_mode,
    fields.sort_worker_url,
    fields.sort_llm_queue_enabled,
    fields.sort_llm_queue_in_credentials,
    String(fields.sort_llm_max_parallel),
    String(fields.sort_cloud_sort_concurrency),
    fields.revision_salt,
  ].join("|");
  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 12);
}

function buildSortCredentialsPublicConfig() {
  const publicEndpoint = publicSortEndpoint();
  const sort_service_mode = env("SORT_SERVICE_MODE", "cloud");
  const sort_worker_url = `${publicEndpoint}/v1/sort/worker`;
  const sort_llm_queue_enabled = env("SORT_LLM_QUEUE_ENABLED", "0");
  const sort_llm_queue_in_credentials = env("SORT_LLM_QUEUE_IN_CREDENTIALS", "auto");
  const sort_llm_max_parallel = envInt("SORT_LLM_MAX_PARALLEL", 2);
  const sort_cloud_sort_concurrency = envInt("SORT_CLOUD_SORT_CONCURRENCY", 1);
  const revision_salt = env("SORT_CREDENTIALS_CONFIG_REVISION_SALT", "");
  const credentials_config_revision = buildCredentialsConfigRevision({
    sort_service_mode,
    sort_worker_url,
    sort_llm_queue_enabled,
    sort_llm_queue_in_credentials,
    sort_llm_max_parallel,
    sort_cloud_sort_concurrency,
    revision_salt,
  });
  return {
    sort_service_mode,
    sort_worker_url,
    credentials_config_revision,
    sort_llm_queue_enabled,
    sort_llm_queue_in_credentials,
    sort_llm_max_parallel,
    sort_cloud_sort_concurrency,
  };
}

module.exports = {
  buildSortCredentialsPublicConfig,
  buildCredentialsConfigRevision,
};
