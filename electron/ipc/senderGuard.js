/**
 * IPC sender validation.
 *
 * Defense-in-depth for the most sensitive IPC channels (system control, system
 * commands, codegen, screen capture). Legitimate calls always originate from
 * the app's own first-party content (packaged `file://`, the localhost dev
 * server, or devtools). A request whose sender frame is some other origin —
 * e.g. content smuggled into a webview — is rejected before the handler runs.
 *
 * The URL check is intentionally permissive for empty / `about:blank` senders,
 * which occur transiently during early frame load, so this never breaks a
 * genuine first-party call.
 */

/**
 * @param {string | null | undefined} url
 * @returns {boolean} true when the URL is first-party app content.
 */
function isTrustedSenderUrl(url) {
  if (url === undefined || url === null) return true;
  if (typeof url !== "string") return false;
  if (url === "" || url === "about:blank") return true;
  return (
    url.startsWith("file://") ||
    url.startsWith("http://localhost") ||
    url.startsWith("http://127.0.0.1") ||
    url.startsWith("devtools://")
  );
}

/**
 * @param {import("electron").IpcMainInvokeEvent | import("electron").IpcMainEvent} event
 * @returns {boolean} true when the event's sender frame is trusted first-party content.
 */
function isTrustedSender(event) {
  try {
    const frame = event && event.senderFrame;
    const url = frame ? frame.url : undefined;
    return isTrustedSenderUrl(url);
  } catch (_) {
    // If the frame was destroyed mid-call, fail closed.
    return false;
  }
}

module.exports = { isTrustedSenderUrl, isTrustedSender };
