const express = require("express");
const { registerAccount, loginAccount, assertAccountActive } = require("../lib/accounts");
const { decodeToken } = require("../lib/tokens");
const { issueAuthTokens, rotateAuthTokens, revokeAccountRefreshTokens } = require("../lib/refreshTokens");
const { authRateLimitMiddleware } = require("../lib/authRateLimit");

const router = express.Router();

async function issueTokenResponse(accountId) {
  return issueAuthTokens(accountId);
}

function httpError(res, status, detail) {
  return res.status(status).json({ detail });
}

router.post("/register", authRateLimitMiddleware("register"), async (req, res) => {
  try {
    const email = String(req.body?.email || "");
    const password = String(req.body?.password || "");
    const firstName = String(req.body?.first_name || req.body?.firstName || "");
    const lastName = String(req.body?.last_name || req.body?.lastName || "");
    if (!email.includes("@")) {
      return httpError(res, 422, "Valid email required");
    }
    const result = await registerAccount(email, password, { firstName, lastName });
    return res.json({
      account_id: result.account_id,
      email: result.email,
      ...(await issueTokenResponse(result.account_id)),
    });
  } catch (e) {
    const status = e.status || 500;
    return httpError(res, status, e.message || "Registration failed");
  }
});

router.post("/login", authRateLimitMiddleware("login"), async (req, res) => {
  try {
    const email = String(req.body?.email || "");
    const password = String(req.body?.password || "");
    const { account_id } = await loginAccount(email, password);
    return res.json(await issueTokenResponse(account_id));
  } catch (e) {
    const status = e.status || 500;
    return httpError(res, status, e.message || "Login failed");
  }
});

router.post("/refresh", authRateLimitMiddleware("refresh"), async (req, res) => {
  const token = String(req.body?.refresh_token || "");
  const rotated = await rotateAuthTokens(token);
  if (!rotated.ok) {
    return httpError(res, rotated.status, rotated.detail);
  }
  const payload = decodeToken(token);
  try {
    await assertAccountActive(String(payload?.sub || ""));
  } catch (e) {
    return httpError(res, e.status || 401, e.message);
  }
  return res.json({
    access_token: rotated.access_token,
    refresh_token: rotated.refresh_token,
    token_type: rotated.token_type,
    expires_in: rotated.expires_in,
  });
});

router.post("/logout", authRateLimitMiddleware("refresh"), async (req, res) => {
  const token = String(req.body?.refresh_token || "");
  const payload = decodeToken(token);
  if (payload?.token_use === "refresh" && payload.sub) {
    await revokeAccountRefreshTokens(String(payload.sub));
  }
  return res.json({ ok: true });
});

module.exports = router;
