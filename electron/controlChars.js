/**
 * Mirrors frontend/src/systemCommands/controlChars.ts (same character rules).
 */

function hasAsciiControlOrDel(s) {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c <= 0x1f || c === 0x7f) return true;
  }
  return false;
}

module.exports = { hasAsciiControlOrDel };
