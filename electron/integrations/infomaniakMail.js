/**
 * Infomaniak Mail REST helpers for workspace progressive import (Sort files → Run sort).
 * Uses the same OAuth/env bearer slot as Infomaniak kDrive (provider `infomaniak`).
 */

const fs = require("fs").promises;
const path = require("path");
const { app } = require("electron");
const { IK_API } = require("./infomaniak/constants");

const IK_MAIL_METADATA_TIMEOUT_MS = 20000;

async function withTimeout(ms, task) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    return await task(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Lightweight HTML → plain-text (matches outlook import behaviour).
 */
function htmlToPlainText(html) {
  if (!html || typeof html !== "string") return "";
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeMailbox(mailbox) {
  const m = String(mailbox || "me").trim();
  return m || "me";
}

function unwrapMailRows(json) {
  if (!json || typeof json !== "object") return [];
  const raw = json.data ?? json.messages;
  return Array.isArray(raw) ? raw : [];
}

function messageRowStableId(row) {
  const v = row?.uid ?? row?.id ?? row?.message_id ?? row?.mailbox_message_id ?? "";
  return String(v ?? "").trim();
}

function canonicalIkMailFolderSlug(folderRaw) {
  const f = String(folderRaw ?? "INBOX")
    .trim()
    .toUpperCase()
    .replace(/-/g, "_");
  if (f === "ALL" || f === "ALL_MESSAGES" || f === "ALLMAIL") return "ALL";
  if (f === "SENT" || f === "SENT_ITEMS" || f === "SENTITEMS") return "SENT";
  return "INBOX";
}

/**
 * One page of messages from `/1/mail/{mailbox}/folder/{folder}/messages`.
 * @returns {Promise<{ ok: true; messages: object[] } | { ok: false; reason: string }>}
 */
async function listInfomaniakMailMessagesPage(accessToken, { mailbox = "me", folder = "INBOX", page = 1, limit = 50 }) {
  const mb = normalizeMailbox(mailbox);
  const url = new URL(`${IK_API}/1/mail/${encodeURIComponent(mb)}/folder/${encodeURIComponent(folder)}/messages`);
  url.searchParams.set("limit", String(Math.min(100, Math.max(1, limit))));
  url.searchParams.set("page", String(Math.max(1, page)));

  try {
    const res = await withTimeout(IK_MAIL_METADATA_TIMEOUT_MS, (signal) =>
      fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
        signal,
      })
    );
    const text = await res.text();
    let json = {};
    try {
      json = JSON.parse(text);
    } catch {
      json = {};
    }
    if (!res.ok) {
      const err = json.error?.description || json.error?.code || json.error || `http_${res.status}`;
      return { ok: false, reason: typeof err === "string" ? err : "http_error" };
    }
    const messages = unwrapMailRows(json);
    return { ok: true, messages };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Try to enrich one message row with full plaintext body via GET detail.
 */
async function fetchInfomaniakMailDetail(accessToken, mailbox, folder, messageId) {
  const mb = normalizeMailbox(mailbox);
  const id = String(messageId || "").trim();
  if (!id) throw new Error("missing_message_id");
  const urls = [
    `${IK_API}/1/mail/${encodeURIComponent(mb)}/folder/${encodeURIComponent(folder)}/messages/${encodeURIComponent(id)}`,
    `${IK_API}/1/mail/${encodeURIComponent(mb)}/messages/${encodeURIComponent(id)}`,
  ];
  let lastReason = "";
  for (const u of urls) {
    try {
      const res = await withTimeout(IK_MAIL_METADATA_TIMEOUT_MS, (signal) =>
        fetch(u, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
          },
          signal,
        })
      );
      const text = await res.text();
      let json = {};
      try {
        json = JSON.parse(text);
      } catch {
        json = {};
      }
      if (!res.ok) {
        lastReason = json.error?.description || json.error?.code || `http_${res.status}`;
        continue;
      }
      const payload = unwrapMailRows(json);
      const row =
        typeof json.data === "object" &&
        json.data !== null &&
        !Array.isArray(json.data) &&
        !(json.result && Array.isArray(json.data))
          ? json.data
          : Array.isArray(payload) && payload[0]
            ? payload[0]
            : json.data ?? json.message ?? {};
      return row || {};
    } catch (e) {
      lastReason = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(lastReason || "detail_fetch_failed");
}

function composePlainBodyFromRows(listRow, detailRow) {
  const merged = { ...listRow, ...detailRow };
  const plain =
    merged.body_plain ??
    merged.text_plain ??
    merged.plain ??
    merged.text ??
    merged.body ??
    merged.content ??
    merged.snippet ??
    merged.preview ??
    "";
  if (typeof plain === "string" && /<[a-z][\s\S]*>/i.test(plain)) return htmlToPlainText(plain);
  return typeof plain === "string" ? plain.trim() : "";
}

function composeSubjectFromRows(listRow, detailRow) {
  const s = detailRow.subject ?? listRow.subject ?? listRow.snippet_subject ?? "";
  return String(s || "No_Subject").trim() || "No_Subject";
}

function composeDateFromRows(listRow, detailRow) {
  return (
    detailRow.created_at ??
    detailRow.updated_at ??
    detailRow.sent_at ??
    detailRow.date ??
    listRow.created_at ??
    listRow.updated_at ??
    listRow.sent_at ??
    listRow.date ??
    ""
  );
}

function composeFromLine(listRow, detailRow) {
  const merged = { ...listRow, ...detailRow };
  const addr = merged.from_email ?? merged.from?.email ?? merged.from_address ?? merged.sender ?? "";
  const name = merged.from_name ?? merged.from?.name ?? "";
  if (name && addr) return `${name} <${addr}>`;
  return String(addr || name || "").trim();
}

/**
 * Compose a filesystem-safe basename (subject fragment + stable id suffix).
 */
function uniqueMessageFilename(subject, messageId, usedNames) {
  const safeSubject = subject
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 60);
  const sid = messageId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);
  let baseName = `${safeSubject}_${sid || "mail"}.txt`;
  if (usedNames.has(baseName)) {
    let i = 2;
    while (usedNames.has(`${safeSubject}_${sid || "mail"}_${i}.txt`)) i++;
    baseName = `${safeSubject}_${sid || "mail"}_${i}.txt`;
  }
  usedNames.add(baseName);
  return baseName;
}

/** @param {{ mailbox?: string; folder?: string; since?: number | null }} opts */
async function fetchAllFilteredMessages(accessToken, { mailbox = "me", folder = "INBOX", since = null } = {}) {
  const mb = normalizeMailbox(mailbox);
  /** @type {{ row: object; folder: string }[]} */
  const combined = [];
  /** @type {{ ok: false; reason: string } | null} */
  let fatalListError = null;

  /** @param {string} slug */
  async function collectSlug(slug) {
    let page = 1;
    for (;;) {
      const chunk = await listInfomaniakMailMessagesPage(accessToken, { mailbox: mb, folder: slug, page, limit: 50 });
      if (!chunk.ok) {
        if (!fatalListError) fatalListError = chunk;
        return;
      }
      for (const row of chunk.messages) {
        combined.push({ row, folder: slug });
      }
      if (chunk.messages.length === 0) break;
      if (chunk.messages.length < 50) break;
      page++;
    }
  }

  const slug = canonicalIkMailFolderSlug(folder);
  if (slug === "ALL") {
    await collectSlug("INBOX");
    await collectSlug("SENT");
  } else {
    await collectSlug(slug);
  }

  if (fatalListError && combined.length === 0) {
    return { ok: false, reason: fatalListError.reason || "list_failed", messages: [] };
  }

  const seenId = new Set();
  /** @type {object[]} */
  const uniq = [];
  for (const { row, folder: rowFolder } of combined) {
    const id = messageRowStableId(row);
    const key = `${rowFolder}:${id}`;
    if (!id || seenId.has(key)) continue;
    seenId.add(key);
    uniq.push({ ...row, __folder: rowFolder });
  }

  /** @type {typeof uniq} */
  const filtered =
    typeof since !== "number" || !Number.isFinite(since)
      ? uniq
      : uniq.filter((row) => {
          const ds = composeDateFromRows(row, {});
          const ms = ds ? Date.parse(String(ds)) : NaN;
          if (!Number.isFinite(ms)) return true;
          return ms >= since;
        });

  filtered.sort((a, b) => {
    const da = composeDateFromRows(a, {});
    const db = composeDateFromRows(b, {});
    const ma = da ? Date.parse(String(da)) : 0;
    const mbRaw = db ? Date.parse(String(db)) : 0;
    return (Number.isFinite(mbRaw) ? mbRaw : 0) - (Number.isFinite(ma) ? ma : 0);
  });

  return { ok: true, messages: filtered };
}

/**
 * @param {string} accessToken
 * @param {{ mailbox?: string; folder?: string; since?: number | null }} filters
 */
async function listInfomaniakMailMessagesForMerge(accessToken, filters) {
  return fetchAllFilteredMessages(accessToken, filters);
}

function infomaniakMailStagingDir(jobIdRaw) {
  const jobId = String(jobIdRaw || "").replace(/[^a-zA-Z0-9_-]/g, "");
  return path.join(require("../accountProfile").resolveProfileRoot(), "infomaniak_mail_sort_staging", jobId || "staging");
}

/**
 * @param {string} accessToken
 * @param {string[]} messageIds Stable ids (`messageRowStableId` order matches messagesMeta folders).
 * @param {object[]} messagesMeta Parallel meta including `folder` (__folder).
 * @param {string} destDir
 */
async function importInfomaniakMailMessagesToDirectory(accessToken, messageIds, destDir, messagesMeta = []) {
  const ids = (messageIds || []).filter(Boolean);
  if (ids.length === 0) return { ok: false, reason: "no_message_ids" };
  await fs.mkdir(destDir, { recursive: true });
  const metaMap = new Map();
  for (let i = 0; i < ids.length; i++) {
    metaMap.set(ids[i], messagesMeta[i] || {});
  }

  /** @type {string[]} */
  const localPaths = [];
  /** @type {{ id: string; reason: string }[]} */
  const failed = [];
  const usedNames = new Set();

  for (const id of ids) {
    const meta = metaMap.get(id) || {};
    const folder = String(meta.__folder || meta.folder || "INBOX").trim() || "INBOX";

    try {
      let detail = {};
      try {
        detail = await fetchInfomaniakMailDetail(accessToken, meta.mailbox ?? "me", folder, id);
      } catch {
        detail = {};
      }
      const subject = composeSubjectFromRows(meta, detail);
      const fromLine = composeFromLine(meta, detail);
      const date = composeDateFromRows(meta, detail);
      let body = composePlainBodyFromRows(meta, detail);
      if (!body.trim()) body = "[No body extracted — try reconnecting Infomaniak with Mail scopes enabled.]";

      const textContent = [`Subject: ${subject}`, `From: ${fromLine}`, `Date: ${date}`, "", body].join("\n");

      const baseName = uniqueMessageFilename(subject, id, usedNames);
      const localPath = path.join(destDir, baseName);
      await fs.writeFile(localPath, textContent, "utf8");
      localPaths.push(localPath);
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      failed.push({ id, reason });
    }
  }

  return { ok: true, localPaths, stagingDir: destDir, failed };
}

module.exports = {
  listInfomaniakMailMessagesPage,
  fetchAllFilteredMessages,
  listInfomaniakMailMessagesForMerge,
  importInfomaniakMailMessagesToDirectory,
  infomaniakMailStagingDir,
  canonicalIkMailFolderSlug,
};
