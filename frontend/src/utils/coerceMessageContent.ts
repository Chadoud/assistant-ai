/**
 * Ensures chat message bodies are always render-safe strings.
 * Non-string persisted content (corrupt storage or malformed API) would otherwise
 * crash React: "Objects are not valid as a React child".
 */
export function coerceMessageContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (content == null) return "";
  if (typeof content === "number" || typeof content === "boolean") return String(content);
  try {
    return JSON.stringify(content);
  } catch {
    return "";
  }
}
