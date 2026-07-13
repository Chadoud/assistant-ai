/**
 * Forward queued inference jobs to colocated LiteLLM.
 */

/**
 * @param {object} job
 * @param {string} litellmBase
 */
async function forwardToLiteLlm(job, litellmBase) {
  const base = litellmBase.replace(/\/$/, "");
  const path = String(job.path || "").startsWith("/") ? job.path : `/${job.path || ""}`;
  const url = `${base}${path}`;
  const method = String(job.method || "POST").toUpperCase();
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: job.authorization,
  };
  const res = await fetch(url, {
    method,
    headers,
    body: method === "GET" ? undefined : JSON.stringify(job.body || {}),
    signal: AbortSignal.timeout(Number.parseInt(process.env.SORT_QUEUE_LITELLM_TIMEOUT_MS || "180000", 10)),
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { detail: text.slice(0, 240) };
  }
  return { statusCode: res.status, data };
}

module.exports = { forwardToLiteLlm };
