/**
 * Amazon S3 credential-based integration (no OAuth, no SDK dependency).
 * Uses AWS Signature V4 (manual implementation) for request signing.
 *
 * Credentials are stored in userData under the "s3" provider key:
 *   { access_key, secret_key, region, bucket, prefix }
 */

const crypto = require("crypto");
const fs = require("fs").promises;
const path = require("path");
const { URL } = require("url");
const { app } = require("electron");

const S3_METADATA_TIMEOUT_MS = 15_000;
const S3_DOWNLOAD_TIMEOUT_MS = 90_000;
const S3_IMPORT_MAX_BYTES = 50 * 1024 * 1024;
const S3_MAX_KEYS = 1000;

// ─── AWS Signature V4 ────────────────────────────────────────────────────────

function hmacSha256(key, data) {
  return crypto.createHmac("sha256", key).update(data).digest();
}

function sha256Hex(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function formatDate(d) {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function formatDateTime(d) {
  return d.toISOString().slice(0, 19).replace(/[-:]/g, "") + "Z";
}

/**
 * Sign an S3 request using AWS Signature V4.
 * Returns headers to add to the request.
 *
 * @param {{
 *   method: string;
 *   url: string;
 *   headers: Record<string, string>;
 *   body?: string;
 *   accessKey: string;
 *   secretKey: string;
 *   region: string;
 *   service?: string;
 * }} opts
 * @returns {Record<string, string>} headers including Authorization + x-amz-date + x-amz-content-sha256
 */
function signRequest({ method, url, headers = {}, body = "", accessKey, secretKey, region, service = "s3" }) {
  const now = new Date();
  const dateStamp = formatDate(now);
  const amzDateTime = formatDateTime(now);
  const parsedUrl = new URL(url);
  const host = parsedUrl.host;

  const payloadHash = sha256Hex(body);

  const allHeaders = {
    ...headers,
    host,
    "x-amz-date": amzDateTime,
    "x-amz-content-sha256": payloadHash,
  };

  // Sort headers canonically
  const sortedHeaderNames = Object.keys(allHeaders).map((k) => k.toLowerCase()).sort();
  const canonicalHeaders = sortedHeaderNames
    .map((k) => `${k}:${allHeaders[Object.keys(allHeaders).find((h) => h.toLowerCase() === k)] || ""}\n`)
    .join("");
  const signedHeaders = sortedHeaderNames.join(";");

  const canonicalQueryString = Array.from(parsedUrl.searchParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const canonicalRequest = [
    method.toUpperCase(),
    parsedUrl.pathname || "/",
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDateTime,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmacSha256(Buffer.from(`AWS4${secretKey}`, "utf8"), dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  const kSigning = hmacSha256(kService, "aws4_request");
  const signature = hmacSha256(kSigning, stringToSign).toString("hex");

  return {
    host,
    "x-amz-date": amzDateTime,
    "x-amz-content-sha256": payloadHash,
    Authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

// ─── Credentials helpers ─────────────────────────────────────────────────────

/** Validate that all required fields are present and non-empty. */
function credentialsLookUsable(creds) {
  return !!(
    creds?.access_key?.trim() &&
    creds?.secret_key?.trim() &&
    creds?.region?.trim() &&
    creds?.bucket?.trim()
  );
}

// ─── S3 API ──────────────────────────────────────────────────────────────────

function s3Endpoint(region, bucket, key = "") {
  const encodedKey = key ? key.split("/").map(encodeURIComponent).join("/") : "";
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
}

async function withTimeout(label, timeoutMs, task) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await task(controller.signal);
  } catch (e) {
    if (e?.name === "AbortError") throw new Error(`${label}_timeout`);
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Parse S3 ListObjectsV2 XML response into a flat list of objects.
 * Uses simple regex — avoids XML parser dependency.
 */
function parseListObjectsV2(xmlText) {
  const items = [];
  const contentsRegex = /<Contents>([\s\S]*?)<\/Contents>/g;
  let m;
  while ((m = contentsRegex.exec(xmlText)) !== null) {
    const block = m[1];
    const key = (/<Key>([\s\S]*?)<\/Key>/.exec(block) || [])[1] || "";
    const size = parseInt((/<Size>([\s\S]*?)<\/Size>/.exec(block) || [])[1] || "0", 10);
    const lastModified = (/<LastModified>([\s\S]*?)<\/LastModified>/.exec(block) || [])[1] || "";
    if (key && !key.endsWith("/")) {
      items.push({ key, size, lastModified });
    }
  }
  const nextContinuationToken = (/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xmlText) || [])[1] || null;
  const isTruncated = /<IsTruncated>true<\/IsTruncated>/.test(xmlText);
  return { items, nextContinuationToken: isTruncated ? nextContinuationToken : null };
}

/**
 * List one page of S3 objects.
 * @param {{ access_key, secret_key, region, bucket, prefix? }} creds
 * @param {{ continuationToken?: string; prefix?: string }} opts
 */
async function listS3Objects(creds, { continuationToken, prefix } = {}) {
  const { access_key, secret_key, region, bucket } = creds;
  const baseUrl = s3Endpoint(region, bucket);
  const params = new URLSearchParams({
    "list-type": "2",
    "max-keys": String(S3_MAX_KEYS),
  });
  const effectivePrefix = prefix ?? creds.prefix ?? "";
  if (effectivePrefix) params.set("prefix", effectivePrefix);
  if (continuationToken) params.set("continuation-token", continuationToken);

  const url = `${baseUrl}?${params.toString()}`;
  try {
    const sigHeaders = signRequest({ method: "GET", url, accessKey: access_key, secretKey: secret_key, region });
    const res = await withTimeout("s3_list", S3_METADATA_TIMEOUT_MS, (signal) =>
      fetch(url, { headers: sigHeaders, signal })
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, reason: `http_${res.status}`, detail: text };
    }
    const xml = await res.text();
    const parsed = parseListObjectsV2(xml);
    return {
      ok: true,
      items: parsed.items,
      nextContinuationToken: parsed.nextContinuationToken,
    };
  } catch (e) {
    return { ok: false, reason: e.message || "fetch_failed" };
  }
}

/**
 * Health check: attempt to list 1 object to verify credentials and bucket access.
 * @param {{ access_key, secret_key, region, bucket }} creds
 */
async function s3CredentialsHealth(creds) {
  if (!credentialsLookUsable(creds)) return { ok: false, reason: "incomplete_credentials" };
  const result = await listS3Objects(creds, {});
  if (!result.ok) return { ok: false, reason: result.reason || "list_failed" };
  return { ok: true };
}

/**
 * Download one S3 object into a staging directory.
 * @param {{ access_key, secret_key, region, bucket }} creds
 * @param {{ key: string; size?: number }} item
 * @param {string} stagingDir
 */
async function downloadS3Object(creds, item, stagingDir) {
  const { access_key, secret_key, region, bucket } = creds;
  const url = s3Endpoint(region, bucket, item.key);
  const filename = sanitizeFilename(path.basename(item.key) || item.key);
  const destPath = path.join(stagingDir, filename);
  try {
    const sigHeaders = signRequest({ method: "GET", url, accessKey: access_key, secretKey: secret_key, region });
    const res = await withTimeout("s3_download", S3_DOWNLOAD_TIMEOUT_MS, (signal) =>
      fetch(url, { headers: sigHeaders, signal })
    );
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(destPath, buf);
    return { ok: true, localPath: destPath };
  } catch (e) {
    return { ok: false, reason: e.message || "download_failed" };
  }
}

/**
 * Download multiple S3 objects into a staging directory.
 * @param {{ access_key, secret_key, region, bucket }} creds
 * @param {object[]} items
 * @param {string} stagingDir
 */
async function importS3FilesToDirectory(creds, items, stagingDir) {
  await fs.mkdir(stagingDir, { recursive: true });
  const localPaths = [];
  const failed = [];

  for (const item of items) {
    if (!item?.key) {
      failed.push({ key: item?.key || "unknown", reason: "invalid_item" });
      continue;
    }
    const size = Number(item.size || 0);
    if (size > S3_IMPORT_MAX_BYTES) {
      failed.push({ key: item.key, reason: "too_large" });
      continue;
    }
    const result = await downloadS3Object(creds, item, stagingDir);
    if (result.ok) {
      localPaths.push(result.localPath);
    } else {
      failed.push({ key: item.key, reason: result.reason });
    }
  }

  return { ok: true, localPaths, failed, stagingDir };
}

function sanitizeFilename(name) {
  return String(name).replace(/[\\/:*?"<>|]/g, "_").slice(0, 200) || "unnamed_file";
}

function s3StagingDir(jobId) {
  return path.join(require("../accountProfile").resolveProfileRoot(), "s3_sort_staging", jobId);
}

module.exports = {
  credentialsLookUsable,
  s3CredentialsHealth,
  listS3Objects,
  importS3FilesToDirectory,
  s3StagingDir,
};
