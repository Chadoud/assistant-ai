import { describe, expect, it, vi } from "vitest";
import { DEFAULT_APP_SETTINGS } from "../settings/appSettingsHydration";
import { GEMINI_SECRET_MASK } from "./geminiConnection";
import { commitWelcomeAiProviderStep } from "./welcomeAiProviderStep";

describe("commitWelcomeAiProviderStep", () => {
  it("forces ollama when Gemini is not connected", async () => {
    const onPatch = vi.fn();
    await commitWelcomeAiProviderStep(DEFAULT_APP_SETTINGS, onPatch);
    expect(onPatch).toHaveBeenCalledWith({ aiProvider: "ollama" });
  });

  it("does not force ollama when only the packaged mask is present", async () => {
    const onPatch = vi.fn();
    const settings = {
      ...DEFAULT_APP_SETTINGS,
      geminiApiKey: GEMINI_SECRET_MASK,
      aiProvider: "ollama" as const,
    };
    // commitGeminiChatSetup may patch provider to gemini; must not force ollama first.
    await commitWelcomeAiProviderStep(settings, onPatch);
    expect(onPatch).not.toHaveBeenCalledWith({ aiProvider: "ollama" });
    const patches = onPatch.mock.calls.map((c) => c[0] as Record<string, unknown>);
    expect(patches.some((p) => p.aiProvider === "gemini")).toBe(true);
  });
});
