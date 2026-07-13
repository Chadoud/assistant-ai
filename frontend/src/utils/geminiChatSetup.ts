import { desktopClient } from "../desktopClient";
import type { AppSettings } from "../types/settings";
import { isGeminiApiKeyConfigured } from "./geminiApiKey";
import { resolveGeminiApiKeyFromSettings } from "./syncGeminiKeyToBackend";

export const DEFAULT_GEMINI_CHAT_MODEL = "gemini-2.5-flash";

/** Resolve the Gemini model id used for chat and cloud-only fallback. */
export function resolveGeminiChatModel(settings: AppSettings): string {
  const current = settings.chatModel.trim();
  if (current.startsWith("gemini-") || current.startsWith("models/gemini")) return current;
  const fromProvider = settings.chatProviders?.gemini?.model?.trim();
  if (fromProvider?.startsWith("gemini-") || fromProvider?.startsWith("models/gemini")) {
    return fromProvider;
  }
  return DEFAULT_GEMINI_CHAT_MODEL;
}

/**
 * When a Gemini key is configured, ensure chat provider + model fields match — chat/voice use Gemini, not local Ollama cards.
 */
export function buildGeminiChatSettingsPatch(settings: AppSettings): Partial<AppSettings> | null {
  const trimmedKey = resolveGeminiApiKeyFromSettings(settings);
  if (!isGeminiApiKeyConfigured(trimmedKey)) return null;

  const chatModel = resolveGeminiChatModel(settings);
  const providerModel = settings.chatProviders?.gemini?.model?.trim() || chatModel;
  const alreadyAligned =
    settings.aiProvider === "gemini" &&
    settings.chatModel === chatModel &&
    settings.geminiApiKey === trimmedKey &&
    settings.chatProviders?.gemini?.apiKey === trimmedKey &&
    settings.chatProviders?.gemini?.model === providerModel;

  if (alreadyAligned) return null;

  return {
    aiProvider: "gemini",
    chatModel,
    geminiApiKey: trimmedKey,
    chatProviders: {
      ...(settings.chatProviders ?? {}),
      gemini: {
        ...(settings.chatProviders?.gemini ?? {}),
        apiKey: trimmedKey,
        model: providerModel,
      },
    },
  };
}

/** Persist Gemini chat settings and mirror the key to the backend for voice. */
export async function commitGeminiChatSetup(
  settings: AppSettings,
  onSettingsPatch: (patch: Partial<AppSettings>) => void
): Promise<void> {
  const patch = buildGeminiChatSettingsPatch(settings);
  if (patch) onSettingsPatch(patch);

  const key = resolveGeminiApiKeyFromSettings({ ...settings, ...patch });
  if (!isGeminiApiKeyConfigured(key)) return;

  try {
    await desktopClient.postAiSetKey({
      provider: "gemini",
      api_key: key,
      gemini_api_key: key,
    });
  } catch (error) {
    throw error instanceof Error ? error : new Error("Could not sync Gemini key to the voice backend.");
  }
}
