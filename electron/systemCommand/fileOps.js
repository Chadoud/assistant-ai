/**
 * Authorized folder open/save handlers for systemCommand:execute.
 */

const path = require("path");
const fsp = require("fs").promises;
const { shell } = require("electron");
const { appendAuditLine } = require("../systemCommandAudit");
const { isAuthorizedFolder } = require("../authorizedPaths");

/**
 * @param {string | undefined} detailBase
 * @param {string} detailSuffix
 * @returns {string | undefined}
 */
function auditDetail(detailBase, detailSuffix) {
  const combined = `${detailBase ? `${detailBase} ` : ""}${detailSuffix}`.trim();
  return combined || undefined;
}

/**
 * @param {{ commandId: string; args?: Record<string, unknown> }} command
 * @param {{ outputDir?: string; authorizedWorkspacePaths?: string[] }} context
 * @param {string | undefined} detailBase
 * @returns {Promise<{ ok: true } | { ok: false; reason: string }>}
 */
async function handleOpenOutputFolder(command, context, detailBase) {
  const out = (context.outputDir ?? "").trim();
  const resolved = path.resolve(out);
  if (!isAuthorizedFolder(resolved)) {
    appendAuditLine({
      commandId: command.commandId,
      outcome: "error",
      detail: "output_dir_not_authorized",
    });
    return { ok: false, reason: "output_dir_not_authorized" };
  }
  try {
    await shell.openPath(resolved);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    appendAuditLine({
      commandId: command.commandId,
      outcome: "error",
      detail: msg.slice(0, 200),
    });
    return { ok: false, reason: "open_failed" };
  }
  appendAuditLine({
    commandId: command.commandId,
    outcome: "ran",
    detail: auditDetail(detailBase, resolved.slice(0, 200)),
  });
  return { ok: true };
}

/**
 * @param {{ commandId: string; args?: Record<string, unknown> }} command
 * @param {{ outputDir?: string; authorizedWorkspacePaths?: string[] }} context
 * @param {string | undefined} detailBase
 * @returns {Promise<{ ok: true } | { ok: false; reason: string }>}
 */
async function handleOpenWorkspaceFolder(command, context, detailBase) {
  const idx =
    command.args && typeof command.args.index === "number" ? command.args.index : -1;
  const paths = Array.isArray(context.authorizedWorkspacePaths)
    ? context.authorizedWorkspacePaths
    : [];
  const raw = typeof idx === "number" && paths[idx] ? String(paths[idx]).trim() : "";
  if (!raw) {
    appendAuditLine({
      commandId: command.commandId,
      outcome: "error",
      detail: "workspace_index_invalid",
    });
    return { ok: false, reason: "workspace_index_invalid" };
  }
  const resolved = path.resolve(raw);
  if (!isAuthorizedFolder(resolved)) {
    appendAuditLine({
      commandId: command.commandId,
      outcome: "error",
      detail: "workspace_path_not_authorized",
    });
    return { ok: false, reason: "workspace_path_not_authorized" };
  }
  try {
    await shell.openPath(resolved);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    appendAuditLine({
      commandId: command.commandId,
      outcome: "error",
      detail: msg.slice(0, 200),
    });
    return { ok: false, reason: "open_failed" };
  }
  appendAuditLine({
    commandId: command.commandId,
    outcome: "ran",
    detail: auditDetail(detailBase, `idx:${idx} ${resolved.slice(0, 200)}`),
  });
  return { ok: true };
}

/**
 * @param {{ commandId: string; args?: Record<string, unknown> }} command
 * @param {{ outputDir?: string; authorizedWorkspacePaths?: string[] }} context
 * @param {string | undefined} detailBase
 * @returns {Promise<{ ok: true } | { ok: false; reason: string }>}
 */
async function handleSaveTextFile(command, context, detailBase) {
  const args = command.args && typeof command.args === "object" ? command.args : {};
  const destination = args.destination;
  const fileName = typeof args.fileName === "string" ? args.fileName : "";
  const content = typeof args.content === "string" ? args.content : "";
  let baseRaw = "";
  if (destination === "output") {
    baseRaw = (context.outputDir ?? "").trim();
  } else if (destination === "workspace") {
    const idx = typeof args.workspaceIndex === "number" ? args.workspaceIndex : -1;
    const paths = Array.isArray(context.authorizedWorkspacePaths)
      ? context.authorizedWorkspacePaths
      : [];
    baseRaw = typeof idx === "number" && paths[idx] ? String(paths[idx]).trim() : "";
  }
  if (!baseRaw) {
    appendAuditLine({
      commandId: command.commandId,
      outcome: "error",
      detail: "save_text_no_base_dir",
    });
    return { ok: false, reason: "save_text_no_base_dir" };
  }
  const baseResolved = path.resolve(baseRaw);
  if (!isAuthorizedFolder(baseResolved)) {
    appendAuditLine({
      commandId: command.commandId,
      outcome: "error",
      detail: "save_text_dir_not_authorized",
    });
    return { ok: false, reason: "save_text_dir_not_authorized" };
  }
  const filePath = path.resolve(baseResolved, fileName);
  const rel = path.relative(baseResolved, filePath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    appendAuditLine({
      commandId: command.commandId,
      outcome: "error",
      detail: "save_text_path_escape",
    });
    return { ok: false, reason: "save_text_path_escape" };
  }
  try {
    await fsp.mkdir(baseResolved, { recursive: true });
    await fsp.writeFile(filePath, content, { encoding: "utf8" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    appendAuditLine({
      commandId: command.commandId,
      outcome: "error",
      detail: msg.slice(0, 200),
    });
    return { ok: false, reason: "save_text_write_failed" };
  }
  appendAuditLine({
    commandId: command.commandId,
    outcome: "ran",
    detail: auditDetail(detailBase, filePath.slice(0, 200)),
  });
  return { ok: true };
}

module.exports = {
  handleOpenOutputFolder,
  handleOpenWorkspaceFolder,
  handleSaveTextFile,
};
