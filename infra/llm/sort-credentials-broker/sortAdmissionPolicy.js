/**

 * Cloud sort admission — shared policy for VPS sort-credentials broker.

 */



function env(name, fallback = "") {

  const v = process.env[name];

  return v !== undefined && String(v).trim() !== "" ? String(v).trim() : fallback;

}



function envInt(name, fallback) {

  const n = Number.parseInt(env(name, String(fallback)), 10);

  return Number.isFinite(n) ? n : fallback;

}



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

 * Per-user slot limits (no queue routing).

 *

 * @param {number} maxParallelRequests

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

 * Decide whether credentials should route classify/embed through the Redis queue.

 *

 * Modes (`SORT_LLM_QUEUE_IN_CREDENTIALS`):

 * - `auto` (default): queue_url only when the queue reports load (fair multi-tenant).

 * - `always`: always include queue_url when SORT_LLM_QUEUE_ENABLED=1.

 * - `never`: omit queue_url even when the queue service is running.

 *

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

  const internalBase = env("SORT_QUEUE_INTERNAL_URL", "http://sort-queue:4011").replace(/\/$/, "");

  const publicHealth = `${queueUrl}/v1/sort/queue/health`;

  const healthUrls = [ `${internalBase}/health`, publicHealth ];



  for (const healthUrl of healthUrls) {

    try {

      const res = await fetchFn(healthUrl, { signal: AbortSignal.timeout(2_000) });

      if (!res.ok) {

        continue;

      }

      const data = await res.json();

      const threshold = envInt("SORT_QUEUE_ADMIT_THRESHOLD", 2);

      const pending = Number(data.pending_jobs) || 0;

      if (data.overloaded === true || pending >= threshold) {

        return queueUrl;

      }

      return null;

    } catch {

      // Try next probe URL; unknown load → direct LiteLLM (best single-user UX).

    }

  }



  return null;

}



/**

 * Slot limits plus optional queue_url when load warrants fair scheduling.

 *

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

};


