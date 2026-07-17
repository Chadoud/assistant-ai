import type { AppSettings } from "../types/settings";
import { isGeminiConnectedInSettings } from "./geminiConnection";
import { commitGeminiChatSetup } from "./geminiChatSetup";

/**
 * Apply welcome step 0 choices: persist Gemini when connected, otherwise default chat to Ollama.
 * Uses isGeminiConnectedInSettings so packaged safeStorage masks count as connected.
 */
export async function commitWelcomeAiProviderStep(
  settings: AppSettings,
  onSettingsPatch: (patch: Partial<AppSettings>) => void
): Promise<void> {
  if (!isGeminiConnectedInSettings(settings)) {
    onSettingsPatch({ aiProvider: "ollama" });
    return;
  }

  await commitGeminiChatSetup(settings, onSettingsPatch);
}
