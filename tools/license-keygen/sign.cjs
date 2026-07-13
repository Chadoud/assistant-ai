#!/usr/bin/env node
/**
 * Internal: sign an offline license (exo1.…) for one machine_id.
 * Usage (from repo root):
 *   node tools/license-keygen/sign.cjs --private-key path/to/secret.hex --machine-id <64-char sha256 hex>
 *
 * Private key: 32-byte Ed25519 seed as 64 hex chars (never commit).
 */

const fs = require("fs");
const crypto = require("crypto");
const path = require("path");

const { LICENSE_PREFIX, PRODUCT_SLUG } = require("../../electron/entitlement/constants");

function canonicalLicensePayload(obj) {
  const ordered = {};
  for (const k of Object.keys(obj).sort()) {
    ordered[k] = obj[k];
  }
  return JSON.stringify(ordered);
}

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

function parseArgs(argv) {
  const out = { privateKeyPath: null, machineId: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--private-key") out.privateKeyPath = argv[++i];
    else if (a === "--machine-id") out.machineId = argv[++i];
  }
  return out;
}

async function main() {
  const { privateKeyPath, machineId } = parseArgs(process.argv.slice(2));
  if (!privateKeyPath || !machineId) {
    console.error(
      "Usage: node tools/license-keygen/sign.cjs --private-key <secret.hex> --machine-id <64-hex fingerprint>"
    );
    process.exit(1);
  }
  const raw = fs.readFileSync(path.resolve(privateKeyPath), "utf8").trim();
  const sk = Buffer.from(raw.replace(/^0x/i, ""), "hex");
  if (sk.length !== 32) {
    console.error("Private key must be 32 bytes (64 hex chars).");
    process.exit(1);
  }
  const mid = String(machineId).trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(mid)) {
    console.error("machine_id must be a 64-char hex SHA-256 fingerprint (see Electron machineId / backend machine_fingerprint).");
    process.exit(1);
  }

  const payload = {
    iat: Math.floor(Date.now() / 1000),
    license_id: crypto.randomUUID(),
    machine_id: mid,
    max_seats: 1,
    product: PRODUCT_SLUG,
    tier: "full",
  };
  const canonical = canonicalLicensePayload(payload);
  const message = new TextEncoder().encode(canonical);
  const ed = await import("@noble/ed25519");
  const sig = await ed.signAsync(message, Uint8Array.from(sk));
  const line = `${LICENSE_PREFIX}.${b64url(Buffer.from(canonical, "utf8"))}.${b64url(Buffer.from(sig))}`;
  console.log(line);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
