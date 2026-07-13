/**
 * Prime a voice session from the main process (OAuth + provider keys stay out of the renderer WS).
 */

const { backendFetch } = require("./backendHttp");
const { readAiProviderEnvForBackendSpawn } = require("./backendAiSecrets");
const { relayAllConnectedIntegrationTokens } = require("./integrationTokenRelayMain");

const PROVIDER_SECRET_ENV = {
  gemini: "GEMINI_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  custom: "CUSTOM_API_KEY",
};

/**
 * @param {string | undefined} providerId
 * @returns {string}
 */
function resolveApiKeyForProvider(providerId) {
  const id = String(providerId || "").trim().toLowerCase();
  if (!id || id === "ollama") return "";
  const env = readAiProviderEnvForBackendSpawn();
  const envKey = PROVIDER_SECRET_ENV[id];
  return envKey ? String(env[envKey] || "").trim() : "";
}

/**
 * @param {{ sessionId?: string; provider?: string; model?: string; baseUrl?: string }} payload
 */
async function primeVoiceSessionFromMain(payload) {
  const sessionId = String(payload?.sessionId || "").trim();
  if (!sessionId) return { ok: false, reason: "session_id_required" };

  const relay = await relayAllConnectedIntegrationTokens();

  const provider = String(payload?.provider || "gemini").trim().toLowerCase();
  const model = String(payload?.model || "").trim();
  const baseUrl = String(payload?.baseUrl || "").trim();
  const apiKey = resolveApiKeyForProvider(provider);

  const prime = await backendFetch("/voice/session-prime", {
    method: "POST",
    body: {
      session_id: sessionId,
      provider,
      model,
      api_key: provider === "ollama" ? "" : apiKey,
      base_url: provider === "custom" ? baseUrl : "",
    },
  });

  if (!prime.ok) {
    return {
      ok: false,
      reason:
        (prime.data && typeof prime.data === "object" && prime.data.detail) ||
        `session_prime_failed_${prime.status}`,
    };
  }

  return { ok: true, relayed: relay.relayed || [] };
}

module.exports = { primeVoiceSessionFromMain, resolveApiKeyForProvider };
