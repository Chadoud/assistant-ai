import { desktopClient } from "../desktopClient";
import type { AppSettings } from "../types/settings";
import {
  isGeminiConnectedInSettings,
  resolveGeminiApiKeyRaw,
} from "./geminiConnection";
import { isGeminiKeyFormatPlausible } from "./geminiApiKey";

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
 * When Gemini is connected, ensure chat provider + model fields match.
 * Mask-only (packaged): align provider/model without rewriting the key fields.
 */
export function buildGeminiChatSettingsPatch(settings: AppSettings): Partial<AppSettings> | null {
  if (!isGeminiConnectedInSettings(settings)) return null;

  const trimmedKey = resolveGeminiApiKeyRaw(settings);
  const chatModel = resolveGeminiChatModel(settings);
  const providerModel = settings.chatProviders?.gemini?.model?.trim() || chatModel;

  if (trimmedKey && isGeminiKeyFormatPlausible(trimmedKey)) {
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

  // Mask-only: keep key fields as-is; only ensure provider + model point at Gemini.
  const alreadyAligned =
    settings.aiProvider === "gemini" &&
    settings.chatModel === chatModel &&
    (settings.chatProviders?.gemini?.model?.trim() || chatModel) === providerModel;

  if (alreadyAligned) return null;

  return {
    aiProvider: "gemini",
    chatModel,
    chatProviders: {
      ...(settings.chatProviders ?? {}),
      gemini: {
        ...(settings.chatProviders?.gemini ?? {}),
        apiKey: settings.chatProviders?.gemini?.apiKey || settings.geminiApiKey || "",
        model: providerModel,
      },
    },
  };
}

/** Persist Gemini chat settings and mirror the key to the backend for voice when a raw key exists. */
export async function commitGeminiChatSetup(
  settings: AppSettings,
  onSettingsPatch: (patch: Partial<AppSettings>) => void
): Promise<void> {
  const patch = buildGeminiChatSettingsPatch(settings);
  if (patch) onSettingsPatch(patch);

  const key = resolveGeminiApiKeyRaw({ ...settings, ...patch });
  if (!isGeminiKeyFormatPlausible(key)) return;

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
