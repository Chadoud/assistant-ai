import type { AppSettings } from "../types/settings";
import { isGeminiApiKeyConfigured } from "./geminiApiKey";
import { commitGeminiChatSetup } from "./geminiChatSetup";

/**
 * Apply welcome step 0 choices: persist Gemini when configured, otherwise default chat to Ollama.
 */
export async function commitWelcomeAiProviderStep(
  settings: AppSettings,
  onSettingsPatch: (patch: Partial<AppSettings>) => void
): Promise<void> {
  if (!isGeminiApiKeyConfigured(settings.geminiApiKey)) {
    onSettingsPatch({ aiProvider: "ollama" });
    return;
  }

  await commitGeminiChatSetup(settings, onSettingsPatch);
}
