/**
 * After OAuth secrets are saved, push them into the Python backend cache.
 * Without this, Settings can show "connected" while voice still uses a stale
 * Gmail-only token and calendar 403s on the next ask.
 */

async function relayTokensAfterConnectSave(relayAll = null) {
  try {
    const run =
      relayAll ||
      require("../integrationTokenRelayMain").relayAllConnectedIntegrationTokens;
    await run();
    return { ok: true };
  } catch (err) {
    console.warn("[integration] post-connect token relay failed:", err && err.message);
    return { ok: false, reason: err && err.message ? String(err.message) : "relay_failed" };
  }
}

module.exports = { relayTokensAfterConnectSave };
