/**
 * Multi-line build-error capture from dev-server logs.
 *
 * Vite/Next errors span several lines (the matched signature line rarely names
 * the offending dependency or file — that detail follows on the next lines).
 * A single-line capture used to clip exactly the part the repair loop needs,
 * so this module records the matched line plus a bounded context window and
 * clears it when the server logs a recovery signal.
 */

const ANSI_RE = /\x1b\[[0-9;]*m/g;

/** Dev-server log signatures that mean the app failed to build/compile. */
const BUILD_ERROR_PATTERNS = [
  /failed to resolve import/i,
  /failed to resolve dependency/i,
  /internal server error/i,
  /pre-transform error/i,
  /could not resolve/i,
  /could not be resolved/i,
  /\bmodule not found\b/i,
  /cannot find module/i,
  /failed to compile/i,
  /unexpected token/i,
];

/** Signatures that mean the dev server recovered (clears a prior error). */
const BUILD_RECOVERY_PATTERNS = [
  /page reload/i,
  /hmr update/i,
  /\bready in\b/i,
  /compiled successfully/i,
  /✓ built in/i,
  /no errors found/i,
];

/** Lines captured after the matched error line (multi-line error bodies). */
const CONTEXT_LINES_AFTER_MATCH = 12;
const MAX_ERROR_CHARS = 1500;

function stripAnsi(line) {
  return String(line).replace(ANSI_RE, "");
}

/**
 * Stateful capture for one dev-server session.
 * @returns {{ push(line: string): void, snapshot(): string | null, reset(): void }}
 */
function createErrorCapture() {
  /** @type {string[] | null} */
  let lines = null;
  let remaining = 0;

  return {
    push(rawLine) {
      const line = stripAnsi(rawLine);
      if (BUILD_RECOVERY_PATTERNS.some((re) => re.test(line))) {
        lines = null;
        remaining = 0;
        return;
      }
      if (BUILD_ERROR_PATTERNS.some((re) => re.test(line))) {
        if (!lines) lines = [];
        lines.push(line.trim());
        remaining = CONTEXT_LINES_AFTER_MATCH;
        return;
      }
      if (lines && remaining > 0 && line.trim()) {
        lines.push(line.trim());
        remaining -= 1;
      }
    },
    snapshot() {
      if (!lines || lines.length === 0) return null;
      return lines.join("\n").slice(0, MAX_ERROR_CHARS);
    },
    reset() {
      lines = null;
      remaining = 0;
    },
  };
}

module.exports = {
  createErrorCapture,
  stripAnsi,
  BUILD_ERROR_PATTERNS,
  BUILD_RECOVERY_PATTERNS,
};
