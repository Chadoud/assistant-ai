/**
 * Control-character checks without regex literals that trip eslint `no-control-regex`.
 */

/** C0 (U+0000–U+001F) or DEL (U+007F). */
export function hasAsciiControlOrDel(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c <= 0x1f || c === 0x7f) return true;
  }
  return false;
}
