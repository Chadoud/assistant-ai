const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

const { canonicalUpdateFeedPayload, compareVersions } = require("./canonical");
const { verifyUpdateFeed } = require("./verify");
const { isDeveloperIdSigned } = require("./isDeveloperIdSigned");
const { EMBEDDED_UPDATE_FEED_PUBLIC_KEY_HEX } = require("./embeddedPublicKey");

test("compareVersions orders dotted numerics", () => {
  assert.equal(compareVersions("1.1.47", "1.1.46"), 1);
  assert.equal(compareVersions("1.1.46", "1.1.47"), -1);
  assert.equal(compareVersions("1.1.47", "1.1.47"), 0);
  assert.equal(compareVersions("1.2.0", "1.1.99"), 1);
});

test("canonicalUpdateFeedPayload sorts keys and drops sig", () => {
  const raw = canonicalUpdateFeedPayload({
    sig: "ignore-me",
    version: "1.0.0",
    notes: "hi",
    windows: "w",
    mac: "m",
  });
  assert.equal(
    raw,
    JSON.stringify({ mac: "m", notes: "hi", version: "1.0.0", windows: "w" })
  );
});

async function signFeed(feed, sk) {
  const ed = await import("@noble/ed25519");
  const message = new TextEncoder().encode(canonicalUpdateFeedPayload(feed));
  const sig = await ed.signAsync(message, Uint8Array.from(sk));
  return { ...feed, sig: Buffer.from(sig).toString("base64url") };
}

test("verifyUpdateFeed accepts valid signature", async () => {
  const sk = Buffer.from(
    "b4b0f4a20282035f3bbc7dc90342de0171a451f09275f3adc18e555b0b457e17",
    "hex"
  );
  const feed = await signFeed(
    {
      version: "1.1.48",
      notes: "test",
      mac: "https://exosites.ch/downloads/exo-assistant/Exo.dmg",
      windows: "https://exosites.ch/downloads/exo-assistant/Exo%20Setup.exe",
    },
    sk
  );
  const v = await verifyUpdateFeed(feed, {
    publicKeyHex: EMBEDDED_UPDATE_FEED_PUBLIC_KEY_HEX,
  });
  assert.equal(v.ok, true);
});

test("verifyUpdateFeed rejects missing sig", async () => {
  const v = await verifyUpdateFeed({ version: "1.1.48", notes: "x" });
  assert.equal(v.ok, false);
  assert.equal(v.reason, "missing_sig");
});

test("verifyUpdateFeed rejects tampered version", async () => {
  const sk = Buffer.from(
    "b4b0f4a20282035f3bbc7dc90342de0171a451f09275f3adc18e555b0b457e17",
    "hex"
  );
  const feed = await signFeed(
    {
      version: "1.1.48",
      notes: "test",
      mac: "m",
      windows: "w",
    },
    sk
  );
  feed.version = "9.9.9";
  const v = await verifyUpdateFeed(feed, {
    publicKeyHex: EMBEDDED_UPDATE_FEED_PUBLIC_KEY_HEX,
  });
  assert.equal(v.ok, false);
  assert.equal(v.reason, "sig_verify");
});

test("verifyUpdateFeed rejects wrong key", async () => {
  const sk = crypto.randomBytes(32);
  const feed = await signFeed(
    { version: "1.0.0", notes: "n", mac: "m", windows: "w" },
    sk
  );
  const v = await verifyUpdateFeed(feed, {
    publicKeyHex: EMBEDDED_UPDATE_FEED_PUBLIC_KEY_HEX,
  });
  assert.equal(v.ok, false);
  assert.equal(v.reason, "sig_verify");
});

test("isDeveloperIdSigned parses codesign Authority lines", () => {
  assert.equal(
    isDeveloperIdSigned({
      codesignOutput:
        "Authority=Developer ID Application: Chady Kassab (D6PLH24366)\nAuthority=Developer ID Certification Authority\n",
    }),
    true
  );
  assert.equal(
    isDeveloperIdSigned({
      codesignOutput: "Authority=Apple Development: Someone\n",
    }),
    false
  );
});
