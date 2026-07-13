import { describe, expect, it } from "vitest";
import { DEFAULT_APP_SETTINGS, mergeAppSettings } from "./appSettingsHydration";
import { stripSecretsForStorage } from "./settingsPersist";

describe("stripSecretsForStorage", () => {
  it("removes gemini and chat provider api keys from persisted payload", () => {
    const settings = mergeAppSettings(
      {
        geminiApiKey: "secret-gemini",
        chatProviders: {
          openai: { apiKey: "sk-test", model: "gpt-4o" },
        },
      },
      DEFAULT_APP_SETTINGS,
    );
    const stripped = stripSecretsForStorage(settings);
    expect(stripped.geminiApiKey).toBe("");
    expect(stripped.chatProviders.openai?.apiKey).toBe("");
    expect(stripped.chatProviders.openai?.model).toBe("gpt-4o");
  });
});
