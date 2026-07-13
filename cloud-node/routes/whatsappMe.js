const express = require("express");
const { requireAuth } = require("../middleware/requireAuth");
const {
  upsertPhoneBinding,
  deletePhoneBinding,
  listEvents,
  purgeOldEvents,
} = require("../lib/whatsappStore");
const { resolveEmbeddedSignupCredentials } = require("../lib/whatsappEmbeddedSignup");
const { embeddedSignupRedirectUri } = require("./whatsappOAuthCallback");
const config = require("../lib/config");

const router = express.Router();

router.post("/me/whatsapp/register", requireAuth, async (req, res) => {
  try {
    const result = await upsertPhoneBinding(req.accountId, req.body || {});
    await purgeOldEvents(req.accountId, config.whatsapp.eventRetentionDays);
    return res.json({ ok: true, ...result });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ ok: false, error: err.message || "register_failed" });
  }
});

router.delete("/me/whatsapp/register/:phoneNumberId", requireAuth, async (req, res) => {
  try {
    await deletePhoneBinding(req.accountId, String(req.params.phoneNumberId || ""));
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || "delete_failed" });
  }
});

router.get("/me/whatsapp/events", requireAuth, async (req, res) => {
  try {
    const sinceId = Number(req.query.since_id || 0);
    const limit = Number(req.query.limit || 50);
    await purgeOldEvents(req.accountId, config.whatsapp.eventRetentionDays);
    const data = await listEvents(req.accountId, sinceId, limit);
    return res.json({ ok: true, ...data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || "list_failed" });
  }
});

router.get("/me/whatsapp/webhook-config", requireAuth, (_req, res) => {
  const configured = Boolean(config.whatsapp.appSecret && config.whatsapp.verifyToken);
  return res.json({
    ok: true,
    webhook_url: `${config.appBaseUrl}/v1/webhooks/whatsapp`,
    configured,
    verify_token_set: Boolean(config.whatsapp.verifyToken),
  });
});

router.get("/me/whatsapp/connect-config", requireAuth, (_req, res) => {
  const metaAppId = config.whatsapp.metaAppId;
  const embeddedSignupConfigId = config.whatsapp.embeddedSignupConfigId;
  const embeddedSignupAvailable = Boolean(
    metaAppId && config.whatsapp.metaAppSecret && embeddedSignupConfigId,
  );
  return res.json({
    ok: true,
    meta_app_id: embeddedSignupAvailable ? metaAppId : null,
    embedded_signup_config_id: embeddedSignupAvailable ? embeddedSignupConfigId : null,
    embedded_signup_available: embeddedSignupAvailable,
    embedded_signup_redirect_uri: embeddedSignupAvailable ? embeddedSignupRedirectUri() : null,
  });
});

router.post("/me/whatsapp/embedded-signup/exchange", requireAuth, async (req, res) => {
  try {
    const credentials = await resolveEmbeddedSignupCredentials(
      {
        code: req.body?.code,
        codeSource: req.body?.code_source,
        oauthRedirectUri: req.body?.oauth_redirect_uri,
        phoneNumberId: req.body?.phone_number_id,
        businessAccountId: req.body?.business_account_id,
        displayPhoneNumber: req.body?.display_phone_number,
      },
      config.whatsapp.metaAppId,
      config.whatsapp.metaAppSecret,
      embeddedSignupRedirectUri(),
    );
    return res.json({ ok: true, credentials });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({
      ok: false,
      error: err.message || "embedded_signup_exchange_failed",
    });
  }
});

module.exports = router;
