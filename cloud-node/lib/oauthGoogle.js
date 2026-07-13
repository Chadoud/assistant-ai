/** Google OIDC: authorize URL, PKCE, code→token exchange, id_token verification. */

const crypto = require("crypto");
const { createRemoteJWKSet, jwtVerify } = require("jose");
const config = require("./config");

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

function isConfigured() {
  return Boolean(config.google.clientId && config.google.clientSecret);
}

/** PKCE pair (S256). The verifier travels in the signed state; the challenge goes to Google. */
function generatePkce() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

function buildAuthUrl({ state, nonce, codeChallenge }) {
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: config.google.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    access_type: "online",
    prompt: "select_account",
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

async function exchangeCode(code, codeVerifier) {
  const body = new URLSearchParams({
    code,
    client_id: config.google.clientId,
    client_secret: config.google.clientSecret,
    redirect_uri: config.google.redirectUri,
    grant_type: "authorization_code",
    code_verifier: codeVerifier,
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed (${res.status})`);
  }
  const data = await res.json();
  if (!data.id_token) {
    throw new Error("Google token response missing id_token");
  }
  return data.id_token;
}

/**
 * @returns {Promise<{ subject: string; email: string | null }>}
 */
async function verifyIdToken(idToken, nonce) {
  const { payload } = await jwtVerify(idToken, JWKS, {
    issuer: ISSUERS,
    audience: config.google.clientId,
  });
  if (nonce && payload.nonce !== nonce) {
    throw new Error("Google id_token nonce mismatch");
  }
  const email = typeof payload.email === "string" ? payload.email : null;
  const emailVerified = payload.email_verified === true || payload.email_verified === "true";
  return {
    subject: String(payload.sub),
    email: email && emailVerified ? email : null,
  };
}

module.exports = { isConfigured, generatePkce, buildAuthUrl, exchangeCode, verifyIdToken };
