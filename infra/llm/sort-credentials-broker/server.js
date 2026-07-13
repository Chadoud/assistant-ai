/**
 * Mint per-user LiteLLM virtual keys on the VPS (same network as LiteLLM).
 *
 * Infomaniak Node hosting cannot reach the LLM VPS; desktops can. Auth stays on
 * api.exosites.ch — this service validates the user's Bearer token via GET /v1/me.
 */
const express = require("express");
const { issueSortLlmCredentials, buildSortCredentialsPublicConfig } = require("./sortLlmCredentials");
const { accountHasSortAccess } = require("./sortAccess");

const app = express();
app.use(express.json({ limit: "32kb" }));

const PORT = Number.parseInt(process.env.PORT || "4010", 10);
const CLOUD_API_BASE = (process.env.CLOUD_API_BASE_URL || "https://api.exosites.ch").replace(
  /\/$/,
  ""
);

/**
 * @param {string} accessToken
 */
async function fetchCloudProfile(accessToken) {
  const res = await fetch(`${CLOUD_API_BASE}/v1/me`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!res.ok) {
    const err = new Error(data.detail || `cloud_profile_${res.status}`);
    err.status = res.status === 401 ? 401 : 502;
    throw err;
  }
  return data;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "exo-sort-credentials-broker" });
});

app.get("/v1/sort/credentials/config", async (req, res) => {
  const header = req.headers.authorization || "";
  if (!header.toLowerCase().startsWith("bearer ")) {
    return res.status(401).json({ detail: "missing_token" });
  }
  const accessToken = header.slice(7).trim();
  if (!accessToken) {
    return res.status(401).json({ detail: "missing_token" });
  }

  try {
    const profile = await fetchCloudProfile(accessToken);
    if (!accountHasSortAccess(profile)) {
      return res.status(402).json({ detail: "sort_not_entitled" });
    }
    const config = buildSortCredentialsPublicConfig();
    return res.json({
      sort_service_mode: config.sort_service_mode,
      sort_worker_url: config.sort_worker_url,
      credentials_config_revision: config.credentials_config_revision,
      sort_llm_queue_in_credentials: config.sort_llm_queue_in_credentials,
    });
  } catch (e) {
    const status = e.status || 500;
    const detail = e.message || "sort_credentials_config_failed";
    if (status >= 500) {
      console.error("[sort/credentials/config]", detail);
    }
    return res.status(status).json({ detail });
  }
});

app.post("/v1/sort/credentials", async (req, res) => {
  const header = req.headers.authorization || "";
  if (!header.toLowerCase().startsWith("bearer ")) {
    return res.status(401).json({ detail: "missing_token" });
  }
  const accessToken = header.slice(7).trim();
  if (!accessToken) {
    return res.status(401).json({ detail: "missing_token" });
  }

  try {
    const profile = await fetchCloudProfile(accessToken);
    if (!accountHasSortAccess(profile)) {
      return res.status(402).json({ detail: "sort_not_entitled" });
    }

    const accountId = String(profile.id || profile.account_id || profile.sub || "user");
    const creds = await issueSortLlmCredentials(accountId);
    return res.json({
      endpoint: creds.endpoint,
      token: creds.token,
      expires_in: creds.expires_in,
      models: creds.models,
      max_parallel_requests: creds.max_parallel_requests,
      llm_max_slots: creds.llm_max_slots,
      sort_max_concurrency: creds.sort_max_concurrency,
      queue_url: creds.queue_url || null,
      sort_service_mode: creds.sort_service_mode || "cloud",
      sort_worker_url: creds.sort_worker_url || null,
      credentials_config_revision: creds.credentials_config_revision || null,
      credentials_managed: true,
    });
  } catch (e) {
    const status = e.status || 500;
    const detail = e.message || "sort_credentials_failed";
    if (status >= 500) {
      console.error("[sort/credentials]", detail);
    }
    return res.status(status).json({ detail });
  }
});

app.listen(PORT, () => {
  console.log(`[exo-sort-credentials-broker] listening on port ${PORT}`);
});
