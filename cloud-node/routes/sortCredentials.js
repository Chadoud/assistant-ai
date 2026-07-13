const express = require("express");
const { getProfile } = require("../lib/accounts");
const { accountHasSortAccess } = require("../lib/sortAccess");
const { issueSortLlmCredentials } = require("../lib/sortLlmCredentials");
const { requireAuth } = require("../middleware/requireAuth");

const router = express.Router();

router.post("/sort/credentials", requireAuth, async (req, res) => {
  try {
    const profile = await getProfile(req.accountId);
    if (!profile) {
      return res.status(401).json({ detail: "invalid_token" });
    }
    if (!accountHasSortAccess(profile)) {
      return res.status(402).json({ detail: "sort_not_entitled" });
    }

    const creds = await issueSortLlmCredentials(req.accountId);
    return res.json({
      endpoint: creds.endpoint,
      token: creds.token,
      expires_in: creds.expires_in,
      models: creds.models,
      max_parallel_requests: creds.max_parallel_requests,
      llm_max_slots: creds.llm_max_slots,
      sort_max_concurrency: creds.sort_max_concurrency,
      queue_url: creds.queue_url || null,
      sort_service_mode: "cloud",
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

module.exports = router;
