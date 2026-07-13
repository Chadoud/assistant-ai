/**
 * Append-only audit log for AI-suggested system commands (main process, userData).
 */

const fs = require("fs");
const path = require("path");
const { app } = require("electron");

/**
 * @param {{ commandId?: string; outcome?: string; detail?: string }} entry
 */
function appendAuditLine(entry) {
  const safe = {
    ts: new Date().toISOString(),
    commandId:
      typeof entry?.commandId === "string" ? entry.commandId.slice(0, 64) : "",
    outcome: typeof entry?.outcome === "string" ? entry.outcome.slice(0, 48) : "",
    detail:
      typeof entry?.detail === "string" ? entry.detail.slice(0, 400) : undefined,
  };
  try {
    const fp = path.join(app.getPath("userData"), "system-command-audit.log");
    fs.appendFileSync(fp, `${JSON.stringify(safe)}\n`, "utf8");
  } catch (e) {
    console.warn("[systemCommandAudit]", e);
  }
}

module.exports = { appendAuditLine };
