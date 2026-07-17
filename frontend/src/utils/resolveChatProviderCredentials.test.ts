import { describe, expect, it } from "vitest";
import { DEFAULT_APP_SETTINGS } from "../settings/appSettingsHydration";
import { GEMINI_SECRET_MASK } from "./geminiConnection";
import { resolveChatProviderCredentials } from "./resolveChatProviderCredentials";

describe("resolveChatProviderCredentials", () => {
  it("returns a sendable Gemini key when raw key is present", () => {
    const routing = resolveChatProviderCredentials({
      ...DEFAULT_APP_SETTINGS,
      aiProvider: "gemini",
      geminiApiKey: "AIzaSy0123456789012345678901234567890",
    });
    expect(routing.apiKey).toBe("AIzaSy0123456789012345678901234567890");
  });

  it("returns empty apiKey for packaged mask (backend uses spawn env)", () => {
    const routing = resolveChatProviderCredentials({
      ...DEFAULT_APP_SETTINGS,
      aiProvider: "gemini",
      geminiApiKey: GEMINI_SECRET_MASK,
    });
    expect(routing.provider).toBe("gemini");
    expect(routing.apiKey).toBe("");
  });
});
