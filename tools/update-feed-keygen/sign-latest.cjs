#!/usr/bin/env node
/**
 * Sign publish/latest.json (Ed25519). Adds/overwrites `sig` (base64url).
 *
 * Usage:
 *   UPDATE_FEED_PRIVATE_KEY_HEX=<64-hex> node tools/update-feed-keygen/sign-latest.cjs publish/latest.json
 *   UPDATE_FEED_PRIVATE_KEY_FILE=path/to/secret.hex node tools/update-feed-keygen/sign-latest.cjs publish/latest.json
 *
 * Private key: 32-byte Ed25519 seed as 64 hex chars (never commit).
 */

const fs = require("fs");
const path = require("path");

const {
  canonicalUpdateFeedPayload,
} = require("../../electron/updateFeed/canonical");

function loadPrivateKey() {
  const fromEnv = (process.env.UPDATE_FEED_PRIVATE_KEY_HEX || "").trim();
  if (fromEnv) {
    return Buffer.from(fromEnv.replace(/^0x/i, ""), "hex");
  }
  const file = (process.env.UPDATE_FEED_PRIVATE_KEY_FILE || "").trim();
  if (file) {
    const raw = fs.readFileSync(path.resolve(file), "utf8").trim();
    return Buffer.from(raw.replace(/^0x/i, ""), "hex");
  }
  return null;
}

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error(
      "Usage: UPDATE_FEED_PRIVATE_KEY_HEX=<hex> node tools/update-feed-keygen/sign-latest.cjs <latest.json>"
    );
    process.exit(1);
  }
  const sk = loadPrivateKey();
  if (!sk || sk.length !== 32) {
    console.error(
      "Set UPDATE_FEED_PRIVATE_KEY_HEX (64 hex chars) or UPDATE_FEED_PRIVATE_KEY_FILE."
    );
    process.exit(1);
  }

  const abs = path.resolve(target);
  const feed = JSON.parse(fs.readFileSync(abs, "utf8"));
  if (!feed || typeof feed !== "object" || Array.isArray(feed)) {
    console.error("latest.json must be a JSON object");
    process.exit(1);
  }
  if (typeof feed.version !== "string" || !feed.version.trim()) {
    console.error("latest.json missing version");
    process.exit(1);
  }

  const canonical = canonicalUpdateFeedPayload(feed);
  const message = new TextEncoder().encode(canonical);
  const ed = await import("@noble/ed25519");
  const sig = await ed.signAsync(message, Uint8Array.from(sk));
  feed.sig = Buffer.from(sig).toString("base64url");

  fs.writeFileSync(abs, `${JSON.stringify(feed, null, 2)}\n`, "utf8");
  console.log(`Signed ${abs} (version ${feed.version})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
