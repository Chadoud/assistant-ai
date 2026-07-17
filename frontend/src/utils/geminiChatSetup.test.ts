import { describe, expect, it } from "vitest";
import { DEFAULT_APP_SETTINGS } from "../settings/appSettingsHydration";
import { GEMINI_SECRET_MASK } from "./geminiConnection";
import { buildGeminiChatSettingsPatch, DEFAULT_GEMINI_CHAT_MODEL } from "./geminiChatSetup";

describe("buildGeminiChatSettingsPatch", () => {
  it("returns null when no Gemini key is configured", () => {
    expect(buildGeminiChatSettingsPatch(DEFAULT_APP_SETTINGS)).toBeNull();
  });

  it("aligns chat provider and model when a Gemini key is present", () => {
    const patch = buildGeminiChatSettingsPatch({
      ...DEFAULT_APP_SETTINGS,
      geminiApiKey: "AIzaSy0123456789012345678901234567890",
    });
    expect(patch).toMatchObject({
      aiProvider: "gemini",
      chatModel: DEFAULT_GEMINI_CHAT_MODEL,
      geminiApiKey: "AIzaSy0123456789012345678901234567890",
    });
    expect(patch?.chatProviders?.gemini?.apiKey).toBe("AIzaSy0123456789012345678901234567890");
  });

  it("aligns provider for mask-only without requiring a raw key", () => {
    const patch = buildGeminiChatSettingsPatch({
      ...DEFAULT_APP_SETTINGS,
      geminiApiKey: GEMINI_SECRET_MASK,
      aiProvider: "ollama",
    });
    expect(patch).toMatchObject({ aiProvider: "gemini", chatModel: DEFAULT_GEMINI_CHAT_MODEL });
    expect(patch?.chatProviders?.gemini?.apiKey).toBe(GEMINI_SECRET_MASK);
  });

  it("returns null when settings are already aligned", () => {
    const settings = {
      ...DEFAULT_APP_SETTINGS,
      aiProvider: "gemini" as const,
      chatModel: DEFAULT_GEMINI_CHAT_MODEL,
      geminiApiKey: "AIzaSy0123456789012345678901234567890",
      chatProviders: {
        gemini: {
          apiKey: "AIzaSy0123456789012345678901234567890",
          model: DEFAULT_GEMINI_CHAT_MODEL,
        },
      },
    };
    expect(buildGeminiChatSettingsPatch(settings)).toBeNull();
  });
});
