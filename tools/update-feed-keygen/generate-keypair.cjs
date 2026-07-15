#!/usr/bin/env node
/**
 * Generate an Ed25519 keypair for signing latest.json.
 * Prints PUBLIC (embed in electron/updateFeed/embeddedPublicKey.js) and PRIVATE
 * (GitHub secret UPDATE_FEED_PRIVATE_KEY_HEX / local env — never commit).
 */

const crypto = require("crypto");

async function main() {
  const ed = await import("@noble/ed25519");
  const sk = crypto.randomBytes(32);
  const pk = await ed.getPublicKeyAsync(Uint8Array.from(sk));
  console.log("PRIVATE (never commit):", sk.toString("hex"));
  console.log("PUBLIC (embed in app):", Buffer.from(pk).toString("hex"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
