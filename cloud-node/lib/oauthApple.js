/** Sign in with Apple: authorize URL, ES256 client secret, code→token, id_token verify. */

const { createRemoteJWKSet, jwtVerify, SignJWT, importPKCS8 } = require("jose");
const config = require("./config");

const AUTH_ENDPOINT = "https://appleid.apple.com/auth/authorize";
const TOKEN_ENDPOINT = "https://appleid.apple.com/auth/token";
const JWKS = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));
const ISSUER = "https://appleid.apple.com";
const CLIENT_SECRET_TTL_SECONDS = 5 * 60;

function isConfigured() {
  const a = config.apple;
  return Boolean(a.clientId && a.teamId && a.keyId && a.privateKey);
}

function buildAuthUrl({ state, nonce }) {
  const params = new URLSearchParams({
    client_id: config.apple.clientId,
    redirect_uri: config.apple.redirectUri,
    response_type: "code",
    // form_post is required when requesting name/email scopes.
    response_mode: "form_post",
    scope: "name email",
    state,
    nonce,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

/** Apple's "client secret" is a short-lived ES256 JWT signed with the .p8 key. */
async function buildClientSecret() {
  const key = await importPKCS8(config.apple.privateKey, "ES256");
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: config.apple.keyId })
    .setIssuer(config.apple.teamId)
    .setSubject(config.apple.clientId)
    .setAudience(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${CLIENT_SECRET_TTL_SECONDS}s`)
    .sign(key);
}

async function exchangeCode(code) {
  const clientSecret = await buildClientSecret();
  const body = new URLSearchParams({
    code,
    client_id: config.apple.clientId,
    client_secret: clientSecret,
    redirect_uri: config.apple.redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    console.error("[auth] Apple token exchange failed:", res.status, errBody.slice(0, 400));
    throw new Error(`Apple token exchange failed (${res.status})`);
  }
  const data = await res.json();
  if (!data.id_token) {
    throw new Error("Apple token response missing id_token");
  }
  return data.id_token;
}

/**
 * @returns {Promise<{ subject: string; email: string | null }>}
 */
async function verifyIdToken(idToken, nonce) {
  const { payload } = await jwtVerify(idToken, JWKS, {
    issuer: ISSUER,
    audience: config.apple.clientId,
  });
  if (nonce && payload.nonce !== nonce) {
    throw new Error("Apple id_token nonce mismatch");
  }
  const email = typeof payload.email === "string" ? payload.email : null;
  return { subject: String(payload.sub), email };
}

module.exports = { isConfigured, buildAuthUrl, exchangeCode, verifyIdToken };
