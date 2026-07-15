#!/usr/bin/env node
/**
 * Release checklist: static security posture gates (M4.4).
 * Exit 0 when all checks pass.
 *
 * Usage: node scripts/verify-security-posture.mjs
 *        npm run verify:security-posture
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;

function ok(msg) {
  console.log(`✓ ${msg}`);
}

function fail(msg) {
  console.error(`✗ ${msg}`);
  failed += 1;
}

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) {
    fail(`${rel} missing`);
    return null;
  }
  return fs.readFileSync(p, "utf8");
}

// 1. risk_tiers.py exists
{
  const rel = "backend/tool_registry/risk_tiers.py";
  const src = read(rel);
  if (src != null) {
    if (
      src.includes("SAFE_TOOLS") &&
      src.includes("APPROVAL_TOOLS") &&
      src.includes("BLOCKED_TOOLS")
    ) {
      ok(`${rel} present with tier sets`);
    } else {
      fail(`${rel} missing expected tier constants`);
    }
  }
}

// 2. voice_ws_auth has no query-token auth path
{
  const rel = "backend/voice_ws_auth.py";
  const src = read(rel);
  if (src != null) {
    const usesQuery =
      /query_params\s*\[\s*["']token["']\s*\]/.test(src) ||
      /query_params\.get\(\s*["']token["']/.test(src) ||
      /\.query(?:_string)?.*token/.test(src) ||
      /token\s*=\s*.*query_params/.test(src);
    const documentsReject = /Query\s+``\?token=``\s+is\s+intentionally\s+unsupported/i.test(
      src
    );
    if (usesQuery) {
      fail(`${rel} still authenticates via query token`);
    } else if (!documentsReject && !src.includes("?token=")) {
      // Soft: prefer explicit reject note; absence of query read is the hard gate.
      ok(`${rel} has no query-token auth path`);
    } else {
      ok(`${rel} has no query-token auth path`);
    }
  }
}

// 3. secretsHandlers always masks (no app.isPackaged gate for raw return)
{
  const rel = "electron/ipc/secretsHandlers.js";
  const src = read(rel);
  if (src != null) {
    const hasMask = src.includes("SECRET_MASK") && /secrets:get/.test(src);
    const packagedGate =
      /isPackaged/.test(src) &&
      (/getSecret\(/.test(src.split("secrets:get")[1] || "") ||
        /return\s+(?:v|value|getSecret)/.test(src));
    // Hard fail: any isPackaged branch that could return raw secrets.
    if (/isPackaged/.test(src)) {
      fail(`${rel} uses app.isPackaged (must always mask for renderer)`);
    } else if (!hasMask || !src.includes("Never return raw secret")) {
      fail(`${rel} does not unconditionally mask secrets:get`);
    } else if (packagedGate) {
      fail(`${rel} packaged gate for raw secret return`);
    } else {
      ok(`${rel} always masks secrets:get`);
    }
  }
}

// 4. authorizedPaths has no blanket home allow
{
  const rel = "electron/authorizedPaths.js";
  const src = read(rel);
  if (src != null) {
    // Blanket allow: isUnder(resolved, home) / startsWith(homedir) as positive grant.
    const blanketHome =
      /isUnder\(\s*resolved\s*,\s*home\s*\)/.test(src) ||
      /isUnder\(\s*resolved\s*,\s*os\.homedir\(\)\s*\)/.test(src) ||
      /resolved\.startsWith\(\s*(?:home|os\.homedir)/.test(src) ||
      /homedir\(\)[\s\S]{0,80}return\s+true/.test(src);
    const documentsNoBlanket = /never merely because it is under \$HOME/i.test(src);
    if (blanketHome) {
      fail(`${rel} still grants paths merely under $HOME`);
    } else if (!documentsNoBlanket) {
      // Still pass if no blanket grant; warn-style note only via soft check.
      ok(`${rel} has no blanket $HOME allow`);
    } else {
      ok(`${rel} has no blanket $HOME allow`);
    }
  }
}

console.log("");
if (failed > 0) {
  console.error(`verify-security-posture: ${failed} check(s) failed`);
  process.exit(1);
}
console.log("verify-security-posture: all checks passed");
process.exit(0);
