const test = require("node:test");
const assert = require("node:assert/strict");
const {
  exchangeEmbeddedSignupCode,
  exchangeEmbeddedSignupCodeOnce,
  buildExchangeRedirectAttempts,
  META_HOSTED_ES_OAUTH_CALLBACK,
  resolveEmbeddedSignupCredentials,
} = require("../lib/whatsappEmbeddedSignup");

const REDIRECT_URI = "https://api.example.com/v1/oauth/whatsapp-embedded-signup/callback";

function mockFetch(routes) {
  return async (url, init = {}) => {
    const key = `${init.method || "GET"} ${url}`;
    const handler = routes[key];
    if (!handler) {
      throw new Error(`unexpected fetch: ${key}`);
    }
    return handler(url, init);
  };
}

test("buildExchangeRedirectAttempts tries null then stated for legacy meta_hosted_es", () => {
  const attempts = buildExchangeRedirectAttempts("meta_hosted_es", REDIRECT_URI, REDIRECT_URI);
  assert.deepEqual(attempts, [null, REDIRECT_URI]);
});

test("buildExchangeRedirectAttempts uses stated redirect only for oauth_callback", () => {
  const attempts = buildExchangeRedirectAttempts("oauth_callback", REDIRECT_URI, REDIRECT_URI);
  assert.deepEqual(attempts, [REDIRECT_URI]);
});

test("buildExchangeRedirectAttempts uses no redirect for embedded_finish", () => {
  const attempts = buildExchangeRedirectAttempts("embedded_finish", REDIRECT_URI, REDIRECT_URI);
  assert.deepEqual(attempts, [null]);
});

test("exchangeEmbeddedSignupCodeOnce without redirect_uri returns access token", async () => {
  const fetchImpl = mockFetch({
    "GET https://graph.facebook.com/v21.0/oauth/access_token?client_id=app&client_secret=secret&code=abc&grant_type=authorization_code":
      async () => ({
        ok: true,
        json: async () => ({ access_token: "EAAB-token" }),
      }),
  });
  const out = await exchangeEmbeddedSignupCodeOnce("app", "secret", "abc", null, fetchImpl);
  assert.equal(out.accessToken, "EAAB-token");
});

test("exchangeEmbeddedSignupCode for meta_hosted_es succeeds without redirect_uri", async () => {
  const fetchImpl = mockFetch({
    "GET https://graph.facebook.com/v21.0/oauth/access_token?client_id=app&client_secret=secret&code=abc&grant_type=authorization_code":
      async () => ({
        ok: true,
        json: async () => ({ access_token: "EAAB-hosted" }),
      }),
  });
  const out = await exchangeEmbeddedSignupCode(
    "app",
    "secret",
    "abc",
    REDIRECT_URI,
    "meta_hosted_es",
    REDIRECT_URI,
    fetchImpl,
  );
  assert.equal(out.accessToken, "EAAB-hosted");
});

test("resolveEmbeddedSignupCredentials subscribes webhooks and returns ids", async () => {
  const fetchImpl = mockFetch({
    "GET https://graph.facebook.com/v21.0/oauth/access_token?client_id=app&client_secret=secret&code=signup-code&grant_type=authorization_code":
      async () => ({
        ok: true,
        json: async () => ({ access_token: "EAAB-signup" }),
      }),
    "POST https://graph.facebook.com/v21.0/waba123/subscribed_apps": async () => ({
      ok: true,
      json: async () => ({ success: true }),
    }),
  });
  const out = await resolveEmbeddedSignupCredentials(
    {
      code: "signup-code",
      codeSource: "meta_hosted_es",
      phoneNumberId: "pn456",
      businessAccountId: "waba123",
      displayPhoneNumber: "+41 79 123 45 67",
    },
    "app",
    "secret",
    REDIRECT_URI,
    fetchImpl,
  );
  assert.deepEqual(out, {
    phone_number_id: "pn456",
    business_account_id: "waba123",
    access_token: "EAAB-signup",
    display_phone_number: "+41 79 123 45 67",
  });
});
