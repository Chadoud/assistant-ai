/**
 * Shared Infomaniak OAuth connect-failure description helper.
 *
 * All three Infomaniak connection cards (kDrive, Calendar, Mail) produce the
 * same human-readable failure message for the redirect-port-in-use error that
 * the Electron OAuth flow emits. This module is the single source of truth for
 * both the magic prefix string and the translation call, eliminating the three
 * previously identical `useCallback` blocks.
 */

/** Error prefix emitted by `electron/integrations/infomaniak.js` when the local OAuth redirect port is already in use. */
const INFOMANIAK_REDIRECT_PORT_PREFIX = "infomaniak_redirect_port_in_use:";

/**
 * Maps an Infomaniak OAuth connect-failure `reason` string to a user-facing
 * message, or returns `undefined` for unknown reasons (lets the caller fall
 * back to the generic error path).
 *
 * @param t - The i18n `t` function from `useI18n()`.
 * @param reason - The raw reason string received from the IPC connect handler.
 */
export function describeInfomaniakConnectFailureReason(
  t: (key: string, params?: Record<string, string>) => string,
  reason: string,
): string | undefined {
  if (reason.startsWith(INFOMANIAK_REDIRECT_PORT_PREFIX)) {
    const port = reason.slice(INFOMANIAK_REDIRECT_PORT_PREFIX.length);
    return t("sources.infomaniakRedirectPortInUse", { port });
  }
  return undefined;
}
