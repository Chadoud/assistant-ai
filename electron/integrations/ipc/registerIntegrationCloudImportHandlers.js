/**
 * IPC handlers: all list* / import* cloud-import operations.
 *
 * Covers Google Drive, Dropbox, OneDrive, Outlook, S3, Slack, iCloud,
 * Infomaniak kDrive, and Infomaniak Mail.
 *
 * @param {Electron.IpcMain} ipcMain
 * @param {import('./integrationCore')} core
 */

const crypto = require("crypto");
const path = require("path");
const storage = require("../storage");
const google = require("../google");
const microsoft = require("../microsoft");
const dropbox = require("../dropbox");
const s3 = require("../s3");
const slack = require("../slack");
const icloud = require("../icloud");
const infomaniak = require("../infomaniak");
const infomaniakMail = require("../infomaniakMail");
const { isTrustedSender } = require("../../ipc/senderGuard");

module.exports = function registerIntegrationCloudImportHandlers(ipcMain, core) {
  /** @type {typeof ipcMain.handle} */
  const register = (channel, handler) => {
    ipcMain.handle(channel, async (event, payload) => {
      if (!isTrustedSender(event)) {
        return { ok: false, reason: "untrusted_sender" };
      }
      return handler(event, payload);
    });
  };

  // ─── Google Drive ────────────────────────────────────────────────────────────

  register("integration:listGoogleDriveFiles", async (_event, payload) => {
    const t0 = Date.now();
    const pageSize =
      payload && typeof payload.pageSize === "number" && payload.pageSize > 0 && payload.pageSize <= 100
        ? payload.pageSize
        : 20;
    const pageToken =
      payload && typeof payload.pageToken === "string" && payload.pageToken.trim()
        ? payload.pageToken.trim()
        : undefined;
    const parentId =
      payload && typeof payload.parentId === "string" && payload.parentId.trim()
        ? payload.parentId.trim()
        : undefined;
    const flatMyDriveFiles = Boolean(payload && payload.flatMyDriveFiles);
    console.log("[ipc:driveList] request", {
      pageSize,
      pageToken: google.redactDrivePageTokenForLog(pageToken),
      parentId: parentId || null,
      flatMyDriveFiles,
    });
    const ud = core.userData();
    core.migrateLegacyGoogleProvider(ud);
    const sess = await core.ensureGoogleSession(ud, core.PROVIDER_GOOGLE_DRIVE);
    if (!sess.ok) {
      console.log("[ipc:driveList] blocked", { reason: sess.reason });
      return sess;
    }
    const result = await google.listDriveFiles(sess.token, { pageSize, pageToken, parentId, flatMyDriveFiles });
    console.log("[ipc:driveList] response", {
      ok: result.ok,
      reason: result.ok ? null : result.reason || "unknown",
      fileCount: result.ok && Array.isArray(result.files) ? result.files.length : 0,
      hasNextPage: result.ok ? Boolean(result.nextPageToken) : false,
      elapsedMs: Date.now() - t0,
    });
    return result;
  });

  register("integration:importGoogleDriveFiles", async (_event, payload) => {
    const t0 = Date.now();
    const fileIds = payload && Array.isArray(payload.fileIds) ? payload.fileIds.map((x) => String(x)) : [];
    const reuseStaging =
      payload && typeof payload.stagingDir === "string" && payload.stagingDir.trim()
        ? payload.stagingDir.trim()
        : null;
    console.log("[ipc:driveImport] request", { fileIdCount: fileIds.length, reuseStaging: Boolean(reuseStaging) });
    if (fileIds.length === 0) {
      console.log("[ipc:driveImport] blocked", { reason: "no_file_ids" });
      return { ok: false, reason: "no_file_ids" };
    }
    const ud = core.userData();
    core.migrateLegacyGoogleProvider(ud);
    const sess = await core.ensureGoogleSession(ud, core.PROVIDER_GOOGLE_DRIVE);
    if (!sess.ok) {
      console.log("[ipc:driveImport] blocked", { reason: sess.reason });
      return sess;
    }
    const stagingResult = core.resolveStagingDir({
      reuseStaging,
      ud,
      makeNewStaging: () => path.join(ud, "drive_sort_staging", crypto.randomBytes(12).toString("hex")),
    });
    if (!stagingResult.ok) {
      console.error("[ipc:driveImport] blocked", { reason: stagingResult.reason });
      return stagingResult;
    }
    const staging = stagingResult.stagingDir;
    console.log("[ipc:driveImport] start", { fileIdCount: fileIds.length, staging });
    const r = await google.importDriveFilesToDirectory(sess.token, fileIds, staging);
    if (!r.ok) {
      console.log("[ipc:driveImport] failed", { reason: r.reason || "import_failed", elapsedMs: Date.now() - t0 });
      return { ok: false, reason: r.reason || "import_failed" };
    }
    console.log("[ipc:driveImport] done", {
      localPathCount: Array.isArray(r.localPaths) ? r.localPaths.length : 0,
      failedCount: Array.isArray(r.failed) ? r.failed.length : 0,
      elapsedMs: Date.now() - t0,
    });
    return { ok: true, localPaths: r.localPaths, failed: r.failed, stagingDir: staging };
  });

  // ─── Dropbox ─────────────────────────────────────────────────────────────────

  register("integration:listDropboxFiles", async (_event, payload) => {
    const t0 = Date.now();
    const folderPath = payload && typeof payload.path === "string" ? payload.path : "";
    const cursor =
      payload && typeof payload.cursor === "string" && payload.cursor.trim()
        ? payload.cursor.trim()
        : undefined;
    const recursive = payload && payload.recursive !== false;
    console.log("[ipc:dropboxList] request", { path: folderPath || "/", hasCursor: Boolean(cursor) });
    const ud = core.userData();
    const sess = await core.ensureDropboxSession(ud);
    if (!sess.ok) return sess;
    const result = await dropbox.listDropboxFolder(sess.token, { path: folderPath, cursor, recursive });
    console.log("[ipc:dropboxList] response", {
      ok: result.ok,
      entryCount: result.ok ? result.entries.length : 0,
      hasMore: result.ok ? result.hasMore : false,
      elapsedMs: Date.now() - t0,
    });
    return result;
  });

  register("integration:importDropboxFiles", async (_event, payload) => {
    const t0 = Date.now();
    const entries = payload && Array.isArray(payload.entries) ? payload.entries : [];
    const reuseStaging =
      payload && typeof payload.stagingDir === "string" && payload.stagingDir.trim()
        ? payload.stagingDir.trim()
        : null;
    console.log("[ipc:dropboxImport] request", { entryCount: entries.length, reuseStaging: Boolean(reuseStaging) });
    if (entries.length === 0) return { ok: false, reason: "no_entries" };
    const ud = core.userData();
    const sess = await core.ensureDropboxSession(ud);
    if (!sess.ok) return sess;
    const stagingResult = core.resolveStagingDir({
      reuseStaging,
      ud,
      makeNewStaging: () => dropbox.dropboxStagingDir(crypto.randomBytes(12).toString("hex")),
    });
    if (!stagingResult.ok) {
      console.error("[ipc:dropboxImport] blocked", { reason: stagingResult.reason });
      return stagingResult;
    }
    const staging = stagingResult.stagingDir;
    console.log("[ipc:dropboxImport] start", { entryCount: entries.length, staging });
    const r = await dropbox.importDropboxFilesToDirectory(sess.token, entries, staging);
    if (!r.ok) {
      console.log("[ipc:dropboxImport] failed", { reason: r.reason, elapsedMs: Date.now() - t0 });
      return { ok: false, reason: r.reason || "import_failed" };
    }
    console.log("[ipc:dropboxImport] done", {
      localPathCount: r.localPaths.length,
      failedCount: r.failed.length,
      elapsedMs: Date.now() - t0,
    });
    return { ok: true, localPaths: r.localPaths, failed: r.failed, stagingDir: staging };
  });

  // ─── OneDrive ─────────────────────────────────────────────────────────────────

  register("integration:listOneDriveFiles", async (_event, payload) => {
    const t0 = Date.now();
    const folderPath = payload && typeof payload.path === "string" ? payload.path : "";
    const nextLink =
      payload && typeof payload.nextLink === "string" && payload.nextLink.trim()
        ? payload.nextLink.trim()
        : undefined;
    const recursive = Boolean(payload && payload.recursive);
    console.log("[ipc:oneDriveList] request", {
      path: folderPath || "/",
      hasNextLink: Boolean(nextLink),
      recursive,
    });
    const ud = core.userData();
    const sess = await core.ensureMicrosoftSession(ud);
    if (!sess.ok) return sess;

    if (recursive && !nextLink) {
      const result = await microsoft.listOneDriveAllFilesRecursive(sess.token, folderPath);
      console.log("[ipc:oneDriveList] response(recursive)", {
        ok: result.ok,
        itemCount: result.ok ? result.items.length : 0,
        cappedByFolders: result.ok ? result.cappedByFolders : false,
        cappedByFiles: result.ok ? result.cappedByFiles : false,
        elapsedMs: Date.now() - t0,
      });
      return result;
    }

    const result = await microsoft.listOneDriveFolderContents(sess.token, { path: folderPath, nextLink });
    console.log("[ipc:oneDriveList] response", {
      ok: result.ok,
      itemCount: result.ok ? result.items.length : 0,
      hasNextLink: result.ok ? Boolean(result.nextLink) : false,
      elapsedMs: Date.now() - t0,
    });
    return result;
  });

  register("integration:importOneDriveFiles", async (_event, payload) => {
    const t0 = Date.now();
    const items = payload && Array.isArray(payload.items) ? payload.items : [];
    const reuseStaging =
      payload && typeof payload.stagingDir === "string" && payload.stagingDir.trim()
        ? payload.stagingDir.trim()
        : null;
    console.log("[ipc:oneDriveImport] request", { itemCount: items.length, reuseStaging: Boolean(reuseStaging) });
    if (items.length === 0) return { ok: false, reason: "no_items" };
    const ud = core.userData();
    const sess = await core.ensureMicrosoftSession(ud);
    if (!sess.ok) return sess;
    const stagingResult = core.resolveStagingDir({
      reuseStaging,
      ud,
      makeNewStaging: () => microsoft.oneDriveStagingDir(crypto.randomBytes(12).toString("hex")),
    });
    if (!stagingResult.ok) {
      console.error("[ipc:oneDriveImport] blocked", { reason: stagingResult.reason });
      return stagingResult;
    }
    const staging = stagingResult.stagingDir;
    console.log("[ipc:oneDriveImport] start", { itemCount: items.length, staging });
    const r = await microsoft.importOneDriveFilesToDirectory(sess.token, items, staging);
    if (!r.ok) {
      console.log("[ipc:oneDriveImport] failed", { reason: r.reason, elapsedMs: Date.now() - t0 });
      return { ok: false, reason: r.reason || "import_failed" };
    }
    console.log("[ipc:oneDriveImport] done", {
      localPathCount: r.localPaths.length,
      failedCount: r.failed.length,
      elapsedMs: Date.now() - t0,
    });
    return { ok: true, localPaths: r.localPaths, failed: r.failed, stagingDir: staging };
  });

  // ─── Outlook ─────────────────────────────────────────────────────────────────

  register("integration:listOutlookMessages", async (_event, payload) => {
    const t0 = Date.now();
    const folder = payload && typeof payload.folder === "string" ? payload.folder : "Inbox";
    const since =
      payload && typeof payload.since === "string" && payload.since.trim()
        ? payload.since.trim()
        : undefined;
    const nextLink =
      payload && typeof payload.nextLink === "string" && payload.nextLink.trim()
        ? payload.nextLink.trim()
        : undefined;
    const MAX_OUTLOOK_PAGE_SIZE = 500;
    const rawPageSize = payload && typeof payload.pageSize === "number" ? payload.pageSize : 50;
    if (rawPageSize > MAX_OUTLOOK_PAGE_SIZE) {
      return { ok: false, reason: `pageSize exceeds maximum of ${MAX_OUTLOOK_PAGE_SIZE}` };
    }
    const pageSize = rawPageSize > 0 ? rawPageSize : 50;
    console.log("[ipc:outlookList] request", { folder, since: since || null, hasNextLink: Boolean(nextLink) });
    const ud = core.userData();
    const sess = await core.ensureMicrosoftSession(ud);
    if (!sess.ok) return sess;
    const result = await microsoft.listOutlookMessages(sess.token, { folder, since, nextLink, pageSize });
    console.log("[ipc:outlookList] response", {
      ok: result.ok,
      messageCount: result.ok ? result.messages.length : 0,
      hasNextLink: result.ok ? Boolean(result.nextLink) : false,
      elapsedMs: Date.now() - t0,
    });
    return result;
  });

  register("integration:importOutlookMessages", async (_event, payload) => {
    const t0 = Date.now();
    const messageIds =
      payload && Array.isArray(payload.messageIds)
        ? payload.messageIds.map((x) => String(x))
        : [];
    const messagesMeta = payload && Array.isArray(payload.messagesMeta) ? payload.messagesMeta : [];
    const includeAttachments = Boolean(payload && payload.includeAttachments);
    const reuseStaging =
      payload && typeof payload.stagingDir === "string" && payload.stagingDir.trim()
        ? payload.stagingDir.trim()
        : null;
    console.log("[ipc:outlookImport] request", {
      messageIdCount: messageIds.length,
      includeAttachments,
      reuseStaging: Boolean(reuseStaging),
    });
    if (messageIds.length === 0) return { ok: false, reason: "no_message_ids" };
    const ud = core.userData();
    const sess = await core.ensureMicrosoftSession(ud);
    if (!sess.ok) return sess;
    const stagingResult = core.resolveStagingDir({
      reuseStaging,
      ud,
      makeNewStaging: () => microsoft.outlookStagingDir(crypto.randomBytes(12).toString("hex")),
    });
    if (!stagingResult.ok) {
      console.error("[ipc:outlookImport] blocked", { reason: stagingResult.reason });
      return stagingResult;
    }
    const staging = stagingResult.stagingDir;
    console.log("[ipc:outlookImport] start", { messageIdCount: messageIds.length, staging });
    const r = await microsoft.importOutlookMessagesToDirectory(sess.token, messageIds, staging, {
      includeAttachments,
      messagesMeta,
    });
    if (!r.ok) {
      console.log("[ipc:outlookImport] failed", { reason: r.reason, elapsedMs: Date.now() - t0 });
      return { ok: false, reason: r.reason || "import_failed" };
    }
    console.log("[ipc:outlookImport] done", {
      localPathCount: r.localPaths.length,
      failedCount: r.failed.length,
      elapsedMs: Date.now() - t0,
    });
    return { ok: true, localPaths: r.localPaths, failed: r.failed, stagingDir: staging };
  });

  // ─── S3 ───────────────────────────────────────────────────────────────────────

  register("integration:listS3Objects", async (_event, payload) => {
    const t0 = Date.now();
    const ud = core.userData();
    const creds = storage.loadProviderSecrets(ud, core.PROVIDER_S3);
    if (!s3.credentialsLookUsable(creds)) return { ok: false, reason: "not_configured" };
    const continuationToken = payload?.continuationToken || undefined;
    const prefix = payload?.prefix ?? creds.prefix ?? "";
    const result = await s3.listS3Objects(creds, { continuationToken, prefix });
    console.log("[ipc:s3List] response", { ok: result.ok, itemCount: result.ok ? result.items.length : 0, elapsedMs: Date.now() - t0 });
    return result;
  });

  register("integration:importS3Objects", async (_event, payload) => {
    const t0 = Date.now();
    const items = Array.isArray(payload?.items) ? payload.items : [];
    const reuseStaging =
      typeof payload?.stagingDir === "string" && payload.stagingDir.trim()
        ? payload.stagingDir.trim()
        : null;
    if (items.length === 0) return { ok: false, reason: "no_items" };
    const ud = core.userData();
    const creds = storage.loadProviderSecrets(ud, core.PROVIDER_S3);
    if (!s3.credentialsLookUsable(creds)) return { ok: false, reason: "not_configured" };
    const stagingResult = core.resolveStagingDir({
      reuseStaging,
      ud,
      makeNewStaging: () => s3.s3StagingDir(crypto.randomBytes(12).toString("hex")),
    });
    if (!stagingResult.ok) return stagingResult;
    const staging = stagingResult.stagingDir;
    console.log("[ipc:s3Import] start", { itemCount: items.length, staging });
    const r = await s3.importS3FilesToDirectory(creds, items, staging);
    console.log("[ipc:s3Import] done", { localPathCount: r.localPaths.length, failedCount: r.failed.length, elapsedMs: Date.now() - t0 });
    return { ok: true, localPaths: r.localPaths, failed: r.failed, stagingDir: staging };
  });

  // ─── Slack ────────────────────────────────────────────────────────────────────

  register("integration:listSlackFiles", async (_event, payload) => {
    const t0 = Date.now();
    const ud = core.userData();
    const sess = await core.ensureSlackSession(ud);
    if (!sess.ok) return sess;
    const result = await slack.listSlackFiles(sess.token, {
      channel: payload?.channel,
      types: payload?.types,
      tsFrom: payload?.tsFrom,
      cursor: payload?.cursor,
    });
    console.log("[ipc:slackList] response", { ok: result.ok, fileCount: result.ok ? result.files.length : 0, elapsedMs: Date.now() - t0 });
    return result;
  });

  register("integration:importSlackFiles", async (_event, payload) => {
    const t0 = Date.now();
    const files = Array.isArray(payload?.files) ? payload.files : [];
    const reuseStaging =
      typeof payload?.stagingDir === "string" && payload.stagingDir.trim()
        ? payload.stagingDir.trim()
        : null;
    if (files.length === 0) return { ok: false, reason: "no_files" };
    const ud = core.userData();
    const sess = await core.ensureSlackSession(ud);
    if (!sess.ok) return sess;
    const stagingResult = core.resolveStagingDir({
      reuseStaging,
      ud,
      makeNewStaging: () => slack.slackStagingDir(crypto.randomBytes(12).toString("hex")),
    });
    if (!stagingResult.ok) return stagingResult;
    const staging = stagingResult.stagingDir;
    console.log("[ipc:slackImport] start", { fileCount: files.length, staging });
    const r = await slack.importSlackFilesToDirectory(sess.token, files, staging);
    console.log("[ipc:slackImport] done", { localPathCount: r.localPaths.length, failedCount: r.failed.length, elapsedMs: Date.now() - t0 });
    return { ok: true, localPaths: r.localPaths, failed: r.failed, stagingDir: staging };
  });

  // ─── iCloud ───────────────────────────────────────────────────────────────────

  register("integration:listICloudFiles", async (_event, _payload) => {
    const t0 = Date.now();
    const ud = core.userData();
    const settings = storage.loadProviderSecrets(ud, core.PROVIDER_ICLOUD);
    if (!icloud.icloudSettingsLooksUsable(settings)) return { ok: false, reason: "no_folder_configured" };
    const result = await icloud.listICloudFiles(settings.folder);
    console.log("[ipc:icloudList] response", { ok: result.ok, fileCount: result.ok ? result.files.length : 0, elapsedMs: Date.now() - t0 });
    return result;
  });

  register("integration:importICloudFiles", async (_event, payload) => {
    const t0 = Date.now();
    const items = Array.isArray(payload?.items) ? payload.items : [];
    const reuseStaging =
      typeof payload?.stagingDir === "string" && payload.stagingDir.trim()
        ? payload.stagingDir.trim()
        : null;
    if (items.length === 0) return { ok: false, reason: "no_items" };
    const ud = core.userData();
    const stagingResult = core.resolveStagingDir({
      reuseStaging,
      ud,
      makeNewStaging: () => icloud.icloudStagingDir(crypto.randomBytes(12).toString("hex")),
    });
    if (!stagingResult.ok) return stagingResult;
    const staging = stagingResult.stagingDir;
    console.log("[ipc:icloudImport] start", { itemCount: items.length, staging });
    const r = await icloud.importICloudFilesToDirectory(items, staging);
    console.log("[ipc:icloudImport] done", { localPathCount: r.localPaths.length, failedCount: r.failed.length, elapsedMs: Date.now() - t0 });
    return { ok: true, localPaths: r.localPaths, failed: r.failed, stagingDir: staging };
  });

  // ─── Infomaniak kDrive ────────────────────────────────────────────────────────

  register("integration:listInfomaniakFiles", async (_event, payload) => {
    const t0 = Date.now();
    const driveId = payload?.driveId;
    const recursive = Boolean(payload?.recursive);
    const ud = core.userData();
    const sess = await core.ensureInfomaniakSession(ud);
    if (!sess.ok) return sess;
    if (!driveId) {
      const drives = await infomaniak.listInfomaniakDrives(sess.token);
      console.log("[ipc:ikList] drives", { ok: drives.ok, count: drives.ok ? drives.drives.length : 0, elapsedMs: Date.now() - t0 });
      return drives;
    }
    if (recursive) {
      const result = await infomaniak.listInfomaniakAllFilesRecursive(sess.token, driveId, payload?.rootFolderId || 1);
      console.log("[ipc:ikList] recursive", { ok: result.ok, fileCount: result.ok ? result.files.length : 0, elapsedMs: Date.now() - t0 });
      return result;
    }
    const result = await infomaniak.listInfomaniakFolderFiles(sess.token, driveId, { parentId: payload?.parentId || 1, page: payload?.page || 1 });
    console.log("[ipc:ikList] page", { ok: result.ok, fileCount: result.ok ? result.files.length : 0, elapsedMs: Date.now() - t0 });
    return result;
  });

  register("integration:importInfomaniakFiles", async (_event, payload) => {
    const t0 = Date.now();
    const items = Array.isArray(payload?.items) ? payload.items : [];
    const reuseStaging =
      typeof payload?.stagingDir === "string" && payload.stagingDir.trim()
        ? payload.stagingDir.trim()
        : null;
    if (items.length === 0) return { ok: false, reason: "no_items" };
    const ud = core.userData();
    const sess = await core.ensureInfomaniakSession(ud);
    if (!sess.ok) return sess;
    const stagingResult = core.resolveStagingDir({
      reuseStaging,
      ud,
      makeNewStaging: () => infomaniak.infomaniakStagingDir(crypto.randomBytes(12).toString("hex")),
    });
    if (!stagingResult.ok) return stagingResult;
    const staging = stagingResult.stagingDir;
    console.log("[ipc:ikImport] start", { itemCount: items.length, staging });
    const r = await infomaniak.importInfomaniakFilesToDirectory(sess.token, items, staging);
    console.log("[ipc:ikImport] done", { localPathCount: r.localPaths.length, failedCount: r.failed.length, elapsedMs: Date.now() - t0 });
    return { ok: true, localPaths: r.localPaths, failed: r.failed, stagingDir: staging };
  });

  // ─── Infomaniak Mail ──────────────────────────────────────────────────────────

  register("integration:listInfomaniakMailMessages", async (_event, payload) => {
    const t0 = Date.now();
    const ud = core.userData();
    const sess = await core.ensureInfomaniakSession(ud);
    if (!sess.ok) return sess;
    const mailbox =
      typeof payload?.mailbox === "string" && payload.mailbox.trim()
        ? payload.mailbox.trim()
        : "me";
    const folder =
      typeof payload?.folder === "string" && payload.folder.trim()
        ? payload.folder.trim()
        : "INBOX";
    const rawSince = payload?.since;
    let sinceTs = null;
    if (rawSince !== undefined && rawSince !== null && rawSince !== "") {
      const n = typeof rawSince === "number" ? rawSince : Date.parse(String(rawSince));
      if (Number.isFinite(n)) sinceTs = n;
    }
    const r = await infomaniakMail.listInfomaniakMailMessagesForMerge(sess.token, {
      mailbox,
      folder,
      since: sinceTs,
    });
    console.log("[ipc:ikMailList]", { ok: r.ok, count: r.ok ? r.messages.length : 0, folder, elapsedMs: Date.now() - t0 });
    return r;
  });

  register("integration:importInfomaniakMailMessages", async (_event, payload) => {
    const t0 = Date.now();
    const messageIds =
      Array.isArray(payload?.messageIds)
        ? payload.messageIds.map((x) => String(x)).filter(Boolean)
        : [];
    const messagesMeta = Array.isArray(payload?.messagesMeta) ? payload.messagesMeta : [];
    const reuseStaging =
      payload && typeof payload.stagingDir === "string" && payload.stagingDir.trim()
        ? payload.stagingDir.trim()
        : null;
    if (messageIds.length === 0) return { ok: false, reason: "no_message_ids" };
    const ud = core.userData();
    const sess = await core.ensureInfomaniakSession(ud);
    if (!sess.ok) return sess;
    const stagingResult = core.resolveStagingDir({
      reuseStaging,
      ud,
      makeNewStaging: () => infomaniakMail.infomaniakMailStagingDir(crypto.randomBytes(12).toString("hex")),
    });
    if (!stagingResult.ok) return stagingResult;
    const staging = stagingResult.stagingDir;
    console.log("[ipc:ikMailImport] start", { messageIdCount: messageIds.length, staging });
    const r = await infomaniakMail.importInfomaniakMailMessagesToDirectory(
      sess.token,
      messageIds,
      staging,
      messagesMeta
    );
    if (!r.ok) {
      console.log("[ipc:ikMailImport] failed", { elapsedMs: Date.now() - t0 });
      return r;
    }
    console.log("[ipc:ikMailImport] done", {
      localPathCount: r.localPaths.length,
      failedCount: r.failed.length,
      elapsedMs: Date.now() - t0,
    });
    return { ok: true, localPaths: r.localPaths, failed: r.failed, stagingDir: staging };
  });
};
