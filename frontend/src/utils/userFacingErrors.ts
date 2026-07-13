/**
 * Maps internal error codes and API messages to user-safe i18n keys.
 * Never show snake_case codes or env var names in toast descriptions.
 */

type TI18n = (key: string, vars?: Record<string, string | number>) => string;

const SOCIAL_ERROR_KEYS: Record<string, string> = {
  signin_failed: "userErrors.socialSigninFailed",
  server_setup: "userErrors.socialServerSetup",
  invalid_state: "userErrors.socialInvalidState",
  no_code: "userErrors.socialNoCode",
  cancelled: "cloudAuth.socialCancelled",
  timeout: "userErrors.socialTimeout",
  open_failed: "userErrors.socialOpenFailed",
  cloud_url_not_set: "userErrors.socialUnavailable",
  offline: "userErrors.socialOffline",
  social_auth_already_pending: "userErrors.socialBusy",
  exchange_failed: "userErrors.exchangeFailed",
};

/**
 * Plain-language description for social sign-in failures (Google/Apple).
 */
export function describeSocialSignInError(t: TI18n, raw: string | undefined): string {
  const code = (raw || "signin_failed").trim().toLowerCase();
  const key = SOCIAL_ERROR_KEYS[code] || SOCIAL_ERROR_KEYS.signin_failed;
  return t(key);
}

/**
 * Plain-language description for email register/login API failures.
 */
export function describeEmailAuthError(t: TI18n, raw: string | undefined): string {
  const msg = (raw || "").trim();
  const lower = msg.toLowerCase();

  if (!msg) return t("userErrors.emailGeneric");
  if (lower.includes("already registered") || lower.includes("409")) {
    return t("userErrors.emailAlreadyRegistered");
  }
  if (lower.includes("invalid credentials") || lower.includes("401")) {
    return t("userErrors.emailWrongPassword");
  }
  if (lower.includes("google or apple") || lower.includes("use_social")) {
    return t("userErrors.emailUseSocial");
  }
  if (lower.includes("disabled") || lower.includes("403")) {
    return t("userErrors.emailDisabled");
  }
  if (lower.includes("fetch failed") || lower.includes("network") || lower.includes("econnrefused")) {
    return t("userErrors.emailOffline");
  }
  if (/^[a-z0-9_]+$/.test(msg) && msg.includes("_")) {
    return t("userErrors.emailGeneric");
  }
  return msg.length > 120 ? t("userErrors.emailGeneric") : msg;
}

/**
 * OAuth connect failures (Gmail, Drive, etc.).
 */
export function describeOAuthConnectError(t: TI18n, raw: string | undefined): string {
  const code = (raw || "").trim().toLowerCase();
  if (code === "cancelled") return t("userErrors.oauthCancelled");
  if (code === "oauth_flow_error" || code === "signin_failed") return t("userErrors.oauthFailed");
  if (code.includes("port") || code.includes("eaddrinuse")) return t("userErrors.oauthPortBusy");
  if (/^[a-z0-9_]+$/.test(code)) return t("userErrors.oauthFailed");
  return raw && raw.length <= 120 ? raw : t("userErrors.oauthFailed");
}
