import { describe, expect, it } from "vitest";
import { DEFAULT_APP_SETTINGS } from "../settings/appSettingsHydration";
import { getChatBlockReason, isChatReady } from "./chatReadiness";

describe("chatReadiness", () => {
  it("allows chat when only Gemini is configured (backend optional)", () => {
    const settings = {
      ...DEFAULT_APP_SETTINGS,
      geminiApiKey: "AIzaSy0123456789012345678901234567890",
    };
    expect(isChatReady(settings)).toBe(true);
    expect(getChatBlockReason(settings)).toBeNull();
  });

  it("blocks chat when Gemini key is missing", () => {
    expect(getChatBlockReason(DEFAULT_APP_SETTINGS)).toBe("gemini");
    expect(isChatReady(DEFAULT_APP_SETTINGS)).toBe(false);
  });
});
