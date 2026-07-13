/** Convert an unknown catch value into a human-readable string. */
export function formatError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
