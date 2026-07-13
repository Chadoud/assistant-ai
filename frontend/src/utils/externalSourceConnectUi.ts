type TranslateFn = (key: string) => string;

/**
 * External source connect buttons stay clickable unless a connect/disconnect is in
 * progress or the web Gmail flow needs the local API. Missing OAuth app credentials
 * must not grey out the button — the connect attempt surfaces an actionable toast.
 */
export function externalSourceConnectDisabled(opts: {
  connected: boolean;
  loading?: boolean;
  busy?: boolean;
  /** When false, Gmail web OAuth needs backendOnline to connect. */
  desktop?: boolean;
  backendOnline?: boolean;
}): boolean {
  if (opts.loading || opts.busy) return true;
  if (opts.connected) return false;
  if (opts.desktop === false && opts.backendOnline === false) return true;
  return false;
}

/** Map integration IPC `reason` codes to user-facing connect failure copy. */
export function describeIntegrationConnectFailure(t: TranslateFn, reason: string): string | undefined {
  const code = reason.trim().toLowerCase();
  if (!code) return undefined;
  if (code === "oauth_not_configured") return t("sources.connectorOauthNotConfigured");
  if (code === "untrusted_sender") return t("sources.connectorUntrustedSender");
  if (code === "timeout") return t("userErrors.oauthFailed");
  if (code.startsWith("scope_verification_failed")) return t("sources.connectorScopeVerificationFailed");
  return reason.length <= 160 ? reason : undefined;
}
