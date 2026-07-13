/**
 * True when a voice error indicates an invalid/missing Gemini API key (non-recoverable).
 * Avoid treating bare WebSocket close code 1007 as auth failure — it has other causes.
 */
export function isFatalVoiceApiKeyError(message: string): boolean {
  const low = message.toLowerCase();
  if (
    low.includes("api key not valid") ||
    low.includes("invalid api key") ||
    low.includes("api_key_invalid") ||
    low.includes("gemini_api_key not configured") ||
    low.includes("please pass a valid api key")
  ) {
    return true;
  }
  if (low.includes("1007") && (low.includes("api key") || low.includes("api_key"))) {
    return true;
  }
  return low.includes("not configured") && low.includes("gemini");
}
