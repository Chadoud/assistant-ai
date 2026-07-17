import type { AppSettings, ChatProviderId } from "../types/settings";
import { apiKeyForBackendRequest, resolveGeminiApiKeyRaw } from "./geminiConnection";

/** Active chat provider credentials — shared by streaming chat and autonomous tasks. */
export function resolveChatProviderCredentials(settings: AppSettings): {
  provider: ChatProviderId;
  model: string;
  /** Sendable key only — never the packaged safeStorage mask (empty → backend uses env). */
  apiKey: string;
  baseUrl: string;
} {
  const provider = settings.aiProvider ?? "ollama";
  const providerCfg = settings.chatProviders?.[provider];
  const rawKey =
    provider === "gemini"
      ? resolveGeminiApiKeyRaw(settings) || providerCfg?.apiKey || settings.geminiApiKey || ""
      : providerCfg?.apiKey || "";
  const baseUrl = providerCfg?.baseUrl ?? "";
  return {
    provider,
    model: settings.chatModel ?? "",
    apiKey: apiKeyForBackendRequest(rawKey),
    baseUrl,
  };
}
