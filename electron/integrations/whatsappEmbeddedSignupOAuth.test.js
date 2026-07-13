const test = require("node:test");
const assert = require("node:assert/strict");
const { tryExtractMetaOAuthCode } = require("./whatsappEmbeddedSignupOAuth");

const REDIRECT =
  "https://api.exosites.ch/v1/oauth/whatsapp-embedded-signup/callback";

test("extracts code from api.exosites.ch callback", () => {
  const out = tryExtractMetaOAuthCode(
    `${REDIRECT}?code=abc123&state=xyz`,
    REDIRECT,
  );
  assert.deepEqual(out, {
    code: "abc123",
    codeSource: "oauth_callback",
    oauthRedirectUri: REDIRECT,
  });
});

test("extracts code from Meta hosted_es without redirect_uri (re-auth flow)", () => {
  const out = tryExtractMetaOAuthCode(
    "https://business.facebook.com/messaging/hosted_es/oauth_callback/?code=meta-code&state=1",
    REDIRECT,
  );
  assert.deepEqual(out, {
    code: "meta-code",
    codeSource: "oauth_callback",
    oauthRedirectUri: REDIRECT,
  });
});

test("extracts code from Meta hosted_es with matching redirect_uri", () => {
  const out = tryExtractMetaOAuthCode(
    `https://business.facebook.com/messaging/hosted_es/oauth_callback/?code=meta-code&redirect_uri=${encodeURIComponent(REDIRECT)}`,
    REDIRECT,
  );
  assert.deepEqual(out, {
    code: "meta-code",
    codeSource: "oauth_callback",
    oauthRedirectUri: REDIRECT,
  });
});

test("rejects hosted_es when redirect_uri points elsewhere", () => {
  const out = tryExtractMetaOAuthCode(
    "https://business.facebook.com/messaging/hosted_es/oauth_callback/?code=meta-code&redirect_uri=https%3A%2F%2Fevil.example%2Fcb",
    REDIRECT,
  );
  assert.equal(out, null);
});

test("returns null when code is missing", () => {
  assert.equal(
    tryExtractMetaOAuthCode("https://business.facebook.com/messaging/hosted_es/oauth_callback/", REDIRECT),
    null,
  );
});
