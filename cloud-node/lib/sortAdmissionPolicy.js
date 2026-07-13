/**

 * Cloud sort admission — keeps per-user desktop load aligned with VPS capacity.

 */



/**

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

 * Clamp integer to inclusive range.

 * @param {number} value

 * @param {number} min

 * @param {number} max

 */

function clampInt(value, min, max) {

  return Math.max(min, Math.min(max, value));

}



function publicQueueUrl() {

  return env(

    "SORT_LLM_QUEUE_PUBLIC_URL",

    env("SORT_LLM_BASE_URL", "https://llm-staging.exosites.ch"),

  ).replace(/\/$/, "");

}



/**

 * Derive client-side limits from the VPS per-key parallel cap.

 *

 * @param {number} maxParallelRequests Per-user LiteLLM parallel cap from SORT_LLM_MAX_PARALLEL.

 * @returns {{ max_parallel_requests: number; llm_max_slots: number; sort_max_concurrency: number }}

 */

function buildSortAdmissionPolicy(maxParallelRequests) {

  const slots = clampInt(maxParallelRequests, 1, 8);

  const configuredSort = envInt("SORT_CLOUD_SORT_CONCURRENCY", 2);

  const sortConcurrency = clampInt(configuredSort, 1, Math.min(8, slots));

  return {

    max_parallel_requests: slots,

    llm_max_slots: slots,

    sort_max_concurrency: sortConcurrency,

  };

}



/**

 * @param {{ fetchFn?: typeof fetch }} [options]

 * @returns {Promise<string | null>}

 */

async function resolveQueueUrlForCredentials(options = {}) {

  if (env("SORT_LLM_QUEUE_ENABLED", "0") !== "1") {

    return null;

  }



  const mode = env("SORT_LLM_QUEUE_IN_CREDENTIALS", "auto").toLowerCase();

  const queueUrl = publicQueueUrl();



  if (mode === "never") {

    return null;

  }

  if (mode === "always") {

    return queueUrl;

  }



  const fetchFn = options.fetchFn || globalThis.fetch;

  const healthUrl = `${queueUrl}/v1/sort/queue/health`;



  try {

    const res = await fetchFn(healthUrl, { signal: AbortSignal.timeout(2_000) });

    if (!res.ok) {

      return null;

    }

    const data = await res.json();

    const threshold = envInt("SORT_QUEUE_ADMIT_THRESHOLD", 2);

    const pending = Number(data.pending_jobs) || 0;

    if (data.overloaded === true || pending >= threshold) {

      return queueUrl;

    }

    return null;

  } catch {

    return null;

  }

}



/**

 * @param {number} maxParallelRequests

 * @param {{ fetchFn?: typeof fetch }} [options]

 */

async function buildSortAdmissionPolicyAsync(maxParallelRequests, options = {}) {

  const policy = buildSortAdmissionPolicy(maxParallelRequests);

  const queueUrl = await resolveQueueUrlForCredentials(options);

  if (queueUrl) {

    policy.queue_url = queueUrl;

  }

  return policy;

}



module.exports = {

  buildSortAdmissionPolicy,

  buildSortAdmissionPolicyAsync,

  resolveQueueUrlForCredentials,

  publicQueueUrl,

  clampInt,

};


