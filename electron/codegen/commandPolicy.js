/**
 * Allowlist for codegen install / dev-server commands.
 *
 * These commands are spawned through a shell (`cmd.exe /c` / `sh -c`) with a
 * string that originates from backend codegen frames but is relayed by the
 * renderer. The cwd is already bounded to the studio directory; this module
 * adds the second half of the guarantee: the *command* itself can only be a
 * known package-manager / dev-server invocation, with no shell metacharacters
 * that would allow chaining (`npm i && curl … | sh`).
 */

/** Tokens that enable command chaining, substitution, or redirection in a shell. */
const SHELL_METACHARACTERS = /[;&|`$<>\n\r(){}]/;

/** First token (the executable) must be one of these known JS toolchain binaries. */
const ALLOWED_BINARIES = new Set([
  "npm",
  "pnpm",
  "yarn",
  "bun",
  "npx",
  "node",
  "vite",
  "next",
  "serve",
  "http-server",
]);

/**
 * Validate a codegen shell command against the allowlist.
 *
 * @param {string} command Raw command string (e.g. "npm install").
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
function checkCodegenCommand(command) {
  const trimmed = typeof command === "string" ? command.trim() : "";
  if (!trimmed) {
    return { ok: false, error: "Command is empty." };
  }
  if (SHELL_METACHARACTERS.test(trimmed)) {
    return {
      ok: false,
      error: "Command contains shell control characters and was blocked.",
    };
  }
  const firstToken = trimmed.split(/\s+/)[0];
  if (!ALLOWED_BINARIES.has(firstToken)) {
    return {
      ok: false,
      error: `Command "${firstToken}" is not in the allowed codegen toolchain.`,
    };
  }
  return { ok: true };
}

/**
 * Throwing variant for use at the spawn chokepoint.
 * @param {string} command
 * @throws {Error} when the command is not allowed.
 */
function assertCodegenCommand(command) {
  const result = checkCodegenCommand(command);
  if (!result.ok) {
    throw new Error(result.error);
  }
}

module.exports = { checkCodegenCommand, assertCodegenCommand, ALLOWED_BINARIES };
