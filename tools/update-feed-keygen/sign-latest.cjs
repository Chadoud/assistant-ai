#!/usr/bin/env node
/**
 * Sign publish/latest.json (Ed25519). Adds/overwrites `sig` (base64url).
 *
 * Uses Node.js built-in crypto (no npm install required in CI).
 *
 * Usage:
 *   UPDATE_FEED_PRIVATE_KEY_HEX=<64-hex> node tools/update-feed-keygen/sign-latest.cjs publish/latest.json
 *   UPDATE_FEED_PRIVATE_KEY_FILE=path/to/secret.hex node tools/update-feed-keygen/sign-latest.cjs publish/latest.json
 *
 * Private key: 32-byte Ed25519 seed as 64 hex chars (never commit).
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

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

/** PKCS#8 DER for an Ed25519 seed (RFC 8410). */
function privateKeyFromSeed(seed) {
  const der = Buffer.concat([
    Buffer.from("302e020100300506032b657004220420", "hex"),
    seed,
  ]);
  return crypto.createPrivateKey({ key: der, format: "der", type: "pkcs8" });
}

function main() {
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
  const message = Buffer.from(canonical, "utf8");
  const key = privateKeyFromSeed(sk);
  const sig = crypto.sign(null, message, key);
  if (sig.length !== 64) {
    console.error(`Unexpected signature length ${sig.length}`);
    process.exit(1);
  }
  feed.sig = Buffer.from(sig).toString("base64url");

  fs.writeFileSync(abs, `${JSON.stringify(feed, null, 2)}\n`, "utf8");
  console.log(`Signed ${abs} (version ${feed.version})`);
}

main();
