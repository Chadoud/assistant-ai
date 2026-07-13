import type { AppSettings, ChatProviderId } from "../types/settings";

/** Active chat provider credentials — shared by streaming chat and autonomous tasks. */
export function resolveChatProviderCredentials(settings: AppSettings): {
  provider: ChatProviderId;
  model: string;
  apiKey: string;
  baseUrl: string;
} {
  const provider = settings.aiProvider ?? "ollama";
  const providerCfg = settings.chatProviders?.[provider];
  const apiKey =
    providerCfg?.apiKey || (provider === "gemini" ? settings.geminiApiKey ?? "" : "");
  const baseUrl = providerCfg?.baseUrl ?? "";
  return {
    provider,
    model: settings.chatModel ?? "",
    apiKey,
    baseUrl,
  };
}
