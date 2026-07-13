/**
 * Generates a random 8-byte hex string (16 hex chars).
 * Falls back to a timestamp string if Web Crypto is unavailable.
 */
export function randomHexId(): string {
  try {
    return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) =>
      b.toString(16).padStart(2, "0")
    ).join("");
  } catch {
    return String(Date.now());
  }
}
