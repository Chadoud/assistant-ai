/** Legacy standard keys from Google AI Studio. */
const GEMINI_LEGACY_KEY_PATTERN = /^AIza[0-9A-Za-z_-]{30,}$/;

/** Auth keys (2026+): new Google AI Studio keys default to AQ. prefix. */
const GEMINI_AUTH_KEY_PATTERN = /^AQ\.[0-9A-Za-z_-]{20,}$/;

/**
 * Cleans pasted keys — strips Excel formula prefix, quotes, and whitespace.
 */
export function normalizeGeminiApiKey(raw: string | undefined | null): string {
  let key = (raw ?? "").trim();
  while (key.startsWith("=")) {
    key = key.slice(1).trim();
  }
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim();
  }
  // AI Studio copy/paste sometimes inserts line breaks or spaces in long AQ. keys.
  return key.replace(/\s+/g, "");
}

/**
 * Returns true when the string matches Google AI Studio key shape (not a live API check).
 */
export function isGeminiApiKeyFormatPlausible(apiKey: string | undefined | null): boolean {
  const key = normalizeGeminiApiKey(apiKey);
  return GEMINI_LEGACY_KEY_PATTERN.test(key) || GEMINI_AUTH_KEY_PATTERN.test(key);
}

/**
 * Returns true when the user has entered a plausible Gemini API key.
 */
export function isGeminiApiKeyConfigured(apiKey: string | undefined | null): boolean {
  return isGeminiApiKeyFormatPlausible(apiKey);
}
