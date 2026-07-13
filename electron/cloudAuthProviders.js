/**
 * Discover which sign-in providers the cloud API exposes (password / Google / Apple).
 * Extracted for unit tests without loading Electron.
 */

/**
 * @param {string} base
 * @param {string} provider
 * @param {(input: string, init?: RequestInit) => Promise<Response>} fetchImpl
 */
async function probeOAuthStart(base, provider, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(`${base}/auth/start/${provider}`, { redirect: "manual" });
    return res.status >= 300 && res.status < 400;
  } catch {
    return false;
  }
}

/**
 * @param {string} base cloud API origin without trailing slash
 * @param {(input: string, init?: RequestInit) => Promise<Response>} [fetchImpl]
 * @returns {Promise<{ password: boolean; google: boolean; apple: boolean }>}
 */
async function fetchAuthProviders(base, fetchImpl = fetch) {
  const fallback = { password: true, google: false, apple: false };
  if (!base) return fallback;
  try {
    const res = await fetchImpl(`${base}/v1/public/auth-config`, {
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const data = await res.json();
      return { ...fallback, ...(data && data.providers ? data.providers : {}) };
    }
  } catch {
    /* older deploys may lack /v1/public/auth-config */
  }
  const [google, apple] = await Promise.all([
    probeOAuthStart(base, "google", fetchImpl),
    probeOAuthStart(base, "apple", fetchImpl),
  ]);
  return { password: true, google, apple };
}

module.exports = {
  fetchAuthProviders,
  probeOAuthStart,
};
