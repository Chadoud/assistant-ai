import { describe, expect, it } from "vitest";
import type { AppSettings } from "../types/settings";
import { DEFAULT_APP_SETTINGS } from "../settings/appSettingsHydration";
import { GEMINI_SECRET_MASK } from "./geminiConnection";
import { resolveGeminiApiKeyFromSettings } from "./syncGeminiKeyToBackend";

describe("resolveGeminiApiKeyFromSettings", () => {
  it("prefers chatProviders.gemini over legacy geminiApiKey", () => {
    const settings: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      geminiApiKey: "AIzaSy0123456789012345678901234567890",
      chatProviders: {
        gemini: { apiKey: "AIzaSy_provider_key_123456789012345678", model: "gemini-2.5-flash" },
      },
    };
    expect(resolveGeminiApiKeyFromSettings(settings)).toBe("AIzaSy_provider_key_123456789012345678");
  });

  it("falls back to legacy geminiApiKey when provider entry is empty", () => {
    const settings: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      geminiApiKey: "AIzaSy0123456789012345678901234567890",
    };
    expect(resolveGeminiApiKeyFromSettings(settings)).toBe("AIzaSy0123456789012345678901234567890");
  });

  it("returns empty when no plausible key is configured", () => {
    expect(resolveGeminiApiKeyFromSettings(DEFAULT_APP_SETTINGS)).toBe("");
  });

  it("returns empty for packaged safeStorage mask (not a sendable key)", () => {
    expect(
      resolveGeminiApiKeyFromSettings({
        ...DEFAULT_APP_SETTINGS,
        geminiApiKey: GEMINI_SECRET_MASK,
      }),
    ).toBe("");
  });
});
