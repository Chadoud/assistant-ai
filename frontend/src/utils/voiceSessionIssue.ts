import type { ErrorActionId } from "./userGuidance";

/** Inline copy when the free-tier Gemini cap blocks a stable voice session. */
export const VOICE_QUOTA_LIMIT_MESSAGE =
  "Free Gemini API limit reached. Voice may not stay connected until you add a paid API key.";

/** Shown after several reconnect attempts without a stable session. */
export const VOICE_RECONNECT_ISSUE_MESSAGE =
  "Voice keeps disconnecting. Check your network, or turn the mic off and on.";

/** First signal that the Live session dropped and is retrying. */
export const VOICE_CONNECTION_WEAK_MESSAGE = "Voice connection dropped. Reconnecting…";

/** Reconnect attempts before surfacing the persistent disconnect banner. */
export const VOICE_RECONNECT_ISSUE_THRESHOLD = 3;

/** Issues that should survive a successful reconnect (quota, invalid key). */
export function isPersistentVoiceIssue(actionId: ErrorActionId | undefined): boolean {
  return actionId === "settings:ai-provider";
}
