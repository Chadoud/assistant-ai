/**
 * Shared validator for the read-only `terminal_safe` command.
 *
 * Single source of truth for both the renderer-facing payload validation
 * (validateExecutePayload.js) and the executor (ipc/systemControlHandlers.js),
 * so the allowlist and injection guards can never drift apart.
 *
 * Defense in depth: reject shell metacharacters first — so chaining
 * (`ls && rm`), piping (`cat x | sh`), and substitution (`echo $(...)`) are
 * impossible — then require an allowlisted read-only prefix.
 */

const MAX_TERMINAL_CMD_CHARS = 512;

const TERMINAL_SAFE_PREFIXES = Object.freeze([
  "ls", "dir", "pwd", "echo", "cat",
  "git status", "git log", "git diff",
  "npm run", "python --version", "node --version",
  "pip list", "pip show",
]);

// Characters that enable command chaining, substitution, or redirection.
const FORBIDDEN_SHELL_CHARS = /[;&|`$><(){}\n\r\0]/;

/**
 * @param {string} cmd Raw command string.
 * @returns {{ ok: true } | { ok: false; error: string }}
 */
function validateTerminalCommand(cmd) {
  const stripped = typeof cmd === "string" ? cmd.trim() : "";
  if (!stripped) return { ok: false, error: "terminal_safe_empty_cmd" };
  if (stripped.length > MAX_TERMINAL_CMD_CHARS) {
    return { ok: false, error: "terminal_safe_cmd_too_long" };
  }
  if (FORBIDDEN_SHELL_CHARS.test(stripped)) {
    return { ok: false, error: "terminal_safe_forbidden_chars" };
  }
  const lower = stripped.toLowerCase();
  const allowed = TERMINAL_SAFE_PREFIXES.some((prefix) => lower.startsWith(prefix));
  if (!allowed) return { ok: false, error: "terminal_safe_cmd_not_allowed" };
  return { ok: true };
}

module.exports = {
  MAX_TERMINAL_CMD_CHARS,
  TERMINAL_SAFE_PREFIXES,
  validateTerminalCommand,
};
