import { describe, expect, it } from "vitest";
import { DEFAULT_APP_SETTINGS } from "../settings/appSettingsHydration";
import { GEMINI_SECRET_MASK, isGeminiConnectedInSettings } from "./geminiConnection";

describe("isGeminiConnectedInSettings", () => {
  it("is true for a plausible Gemini key", () => {
    expect(
      isGeminiConnectedInSettings({
        ...DEFAULT_APP_SETTINGS,
        geminiApiKey: "AIzaSy0123456789012345678901234567890",
      }),
    ).toBe(true);
  });

  it("is true for packaged safeStorage mask", () => {
    expect(
      isGeminiConnectedInSettings({
        ...DEFAULT_APP_SETTINGS,
        geminiApiKey: GEMINI_SECRET_MASK,
      }),
    ).toBe(true);
  });

  it("is false when unset", () => {
    expect(isGeminiConnectedInSettings(DEFAULT_APP_SETTINGS)).toBe(false);
  });
});
