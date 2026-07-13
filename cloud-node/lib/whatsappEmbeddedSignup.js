const GRAPH_API_VERSION = "v21.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
/** Meta intermediate OAuth landing page (code appears here before api.exosites.ch redirect). */
const META_HOSTED_ES_OAUTH_CALLBACK =
  "https://business.facebook.com/messaging/hosted_es/oauth_callback/";

/**
 * @param {unknown} err
 * @returns {boolean}
 */
function isRedirectUriExchangeError(err) {
  const msg = err instanceof Error ? err.message : String(err);
  return /redirect_uri|identical to the one you used/i.test(msg);
}

/**
 * @param {string|null|undefined} value
 * @param {Set<string>} seen
 * @param {Array<string|null>} attempts
 */
function pushRedirectAttempt(value, seen, attempts) {
  const key = typeof value === "string" && value.trim() ? value.trim() : "";
  if (seen.has(key)) return;
  seen.add(key);
  attempts.push(key || null);
}

/**
 * @param {"oauth_callback"|"meta_hosted_es"|"embedded_finish"|""} codeSource
 * @param {string} redirectUri
 * @param {string} [oauthRedirectUri] redirect_uri query param from Meta's hosted_es URL
 * @returns {Array<string|null>}
 */
function buildExchangeRedirectAttempts(codeSource, redirectUri, oauthRedirectUri = "") {
  const redirect = typeof redirectUri === "string" ? redirectUri.trim() : "";
  const stated =
    typeof oauthRedirectUri === "string" && oauthRedirectUri.trim()
      ? oauthRedirectUri.trim()
      : redirect;
  /** @type {Array<string|null>} */
  const attempts = [];
  const seen = new Set();

  if (codeSource === "embedded_finish") {
    // postMessage FINISH from WA_EMBEDDED_SIGNUP — exchange with app secret only.
    pushRedirectAttempt(null, seen, attempts);
  } else if (codeSource === "oauth_callback") {
    // OAuth dialog redirect — must match redirect_uri from the onboard URL exactly.
    pushRedirectAttempt(stated, seen, attempts);
  } else if (codeSource === "meta_hosted_es") {
    pushRedirectAttempt(null, seen, attempts);
    pushRedirectAttempt(stated, seen, attempts);
  } else {
    pushRedirectAttempt(null, seen, attempts);
    pushRedirectAttempt(stated, seen, attempts);
    pushRedirectAttempt(META_HOSTED_ES_OAUTH_CALLBACK, seen, attempts);
  }
  return attempts;
}

/**
 * @param {string} appId
 * @param {string} appSecret
 * @param {string} code
 * @param {string|null|undefined} redirectUri Omit for embedded-signup FINISH codes.
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<{ accessToken: string }>}
 */
async function exchangeEmbeddedSignupCodeOnce(appId, appSecret, code, redirectUri, fetchImpl = fetch) {
  const redirect = typeof redirectUri === "string" ? redirectUri.trim() : "";
  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    code: code.trim(),
  });
  if (redirect) {
    params.set("redirect_uri", redirect);
  } else {
    params.set("grant_type", "authorization_code");
  }

  const attempts = [
    { method: "GET", url: `${GRAPH_API_BASE}/oauth/access_token?${params.toString()}` },
    {
      method: "POST",
      url: `${GRAPH_API_BASE}/oauth/access_token`,
      body: params.toString(),
    },
  ];

  let lastErr = null;
  for (const attempt of attempts) {
    try {
      const res = await fetchImpl(
        attempt.url,
        attempt.method === "POST"
          ? {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: attempt.body,
            }
          : { method: "GET" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          typeof data?.error?.message === "string" ? data.error.message : `http_${res.status}`;
        const err = new Error(msg);
        err.status = res.status;
        throw err;
      }
      const accessToken = typeof data.access_token === "string" ? data.access_token.trim() : "";
      if (!accessToken) {
        const err = new Error("missing_access_token");
        err.status = 502;
        throw err;
      }
      return { accessToken };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("embedded_signup_exchange_failed");
}

/**
 * Meta returns two code types: embedded FINISH (no redirect_uri) and OAuth callback (requires redirect_uri).
 * @param {string} appId
 * @param {string} appSecret
 * @param {string} code
 * @param {string} redirectUri
 * @param {"oauth_callback"|"meta_hosted_es"|"embedded_finish"|""} [codeSource]
 * @param {string} [oauthRedirectUri]
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<{ accessToken: string }>}
 */
async function exchangeEmbeddedSignupCode(
  appId,
  appSecret,
  code,
  redirectUri,
  codeSource = "",
  oauthRedirectUri = "",
  fetchImpl = fetch,
) {
  const attempts = buildExchangeRedirectAttempts(codeSource, redirectUri, oauthRedirectUri);

  let lastErr = null;
  for (let i = 0; i < attempts.length; i += 1) {
    const attemptRedirect = attempts[i];
    try {
      return await exchangeEmbeddedSignupCodeOnce(appId, appSecret, code, attemptRedirect, fetchImpl);
    } catch (err) {
      lastErr = err;
      console.warn(
        "[whatsappEmbeddedSignup] token exchange attempt failed",
        JSON.stringify({
          codeSource: codeSource || "unknown",
          attempt: i + 1,
          totalAttempts: attempts.length,
          usedRedirectUri: attemptRedirect || "(none)",
        }),
      );
      if (attempts.length === 1 || !isRedirectUriExchangeError(err)) throw err;
    }
  }
  throw lastErr || new Error("embedded_signup_exchange_failed");
}

/**
 * @param {string} accessToken
 * @param {string} wabaId
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<Array<{ id: string; display_phone_number?: string }>>}
 */
async function listWabaPhoneNumbers(accessToken, wabaId, fetchImpl = fetch) {
  const url = `${GRAPH_API_BASE}/${encodeURIComponent(wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name`;
  const res = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = typeof data?.error?.message === "string" ? data.error.message : `http_${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return Array.isArray(data.data) ? data.data : [];
}

/**
 * @param {string} accessToken
 * @param {string} wabaId
 * @param {typeof fetch} fetchImpl
 */
async function subscribeWabaWebhooks(accessToken, wabaId, fetchImpl = fetch) {
  const url = `${GRAPH_API_BASE}/${encodeURIComponent(wabaId)}/subscribed_apps`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = typeof data?.error?.message === "string" ? data.error.message : `http_${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

/**
 * Discover WABA ids granted to this token via debug_token granular scopes.
 * @param {string} accessToken
 * @param {string} appId
 * @param {string} appSecret
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<string[]>}
 */
async function discoverWabaIdsFromToken(accessToken, appId, appSecret, fetchImpl = fetch) {
  const appToken = `${appId}|${appSecret}`;
  const url = `${GRAPH_API_BASE}/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(appToken)}`;
  const res = await fetchImpl(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return [];
  const scopes = Array.isArray(data?.data?.granular_scopes) ? data.data.granular_scopes : [];
  const ids = new Set();
  for (const scope of scopes) {
    if (!scope || typeof scope !== "object") continue;
    const scopeName = typeof scope.scope === "string" ? scope.scope : "";
    if (!scopeName.includes("whatsapp")) continue;
    const targets = Array.isArray(scope.target_ids) ? scope.target_ids : [];
    for (const id of targets) {
      if (typeof id === "string" && id.trim()) ids.add(id.trim());
    }
  }
  return [...ids];
}

/**
 * @param {object} input
 * @param {string} input.code
 * @param {"oauth_callback"|"meta_hosted_es"|"embedded_finish"|""} [input.codeSource]
 * @param {string} [input.oauthRedirectUri]
 * @param {string} [input.phoneNumberId]
 * @param {string} [input.businessAccountId]
 * @param {string} appId
 * @param {string} appSecret
 * @param {string} redirectUri
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{ phone_number_id: string; business_account_id: string; access_token: string; display_phone_number?: string }>}
 */
async function resolveEmbeddedSignupCredentials(
  input,
  appId,
  appSecret,
  redirectUri,
  fetchImpl = fetch,
) {
  const code = typeof input?.code === "string" ? input.code.trim() : "";
  if (!code) {
    const err = new Error("missing_code");
    err.status = 400;
    throw err;
  }
  if (!appId || !appSecret) {
    const err = new Error("embedded_signup_not_configured");
    err.status = 503;
    throw err;
  }

  const codeSource =
    input?.codeSource === "oauth_callback" ||
    input?.codeSource === "meta_hosted_es" ||
    input?.codeSource === "embedded_finish"
      ? input.codeSource
      : "";

  const oauthRedirectUri =
    typeof input?.oauthRedirectUri === "string" ? input.oauthRedirectUri.trim() : "";

  const { accessToken } = await exchangeEmbeddedSignupCode(
    appId,
    appSecret,
    code,
    redirectUri,
    codeSource,
    oauthRedirectUri,
    fetchImpl,
  );

  let phoneNumberId =
    typeof input?.phoneNumberId === "string" ? input.phoneNumberId.trim() : "";
  let businessAccountId =
    typeof input?.businessAccountId === "string" ? input.businessAccountId.trim() : "";
  let displayPhoneNumber =
    typeof input?.displayPhoneNumber === "string" ? input.displayPhoneNumber.trim() : "";

  if (!businessAccountId) {
    const discovered = await discoverWabaIdsFromToken(accessToken, appId, appSecret, fetchImpl);
    if (discovered.length > 0) businessAccountId = discovered[0];
  }

  if (businessAccountId) {
    await subscribeWabaWebhooks(accessToken, businessAccountId, fetchImpl);
  }

  if (!phoneNumberId && businessAccountId) {
    const phones = await listWabaPhoneNumbers(accessToken, businessAccountId, fetchImpl);
    const first = phones.find((row) => typeof row?.id === "string" && row.id.trim());
    if (first?.id) {
      phoneNumberId = first.id.trim();
      if (!displayPhoneNumber && typeof first.display_phone_number === "string") {
        displayPhoneNumber = first.display_phone_number.trim();
      }
    }
  }

  if (!phoneNumberId || !businessAccountId) {
    const err = new Error("missing_phone_or_waba");
    err.status = 400;
    throw err;
  }

  return {
    phone_number_id: phoneNumberId,
    business_account_id: businessAccountId,
    access_token: accessToken,
    ...(displayPhoneNumber ? { display_phone_number: displayPhoneNumber } : {}),
  };
}

module.exports = {
  GRAPH_API_BASE,
  META_HOSTED_ES_OAUTH_CALLBACK,
  buildExchangeRedirectAttempts,
  exchangeEmbeddedSignupCode,
  exchangeEmbeddedSignupCodeOnce,
  listWabaPhoneNumbers,
  subscribeWabaWebhooks,
  discoverWabaIdsFromToken,
  resolveEmbeddedSignupCredentials,
};
