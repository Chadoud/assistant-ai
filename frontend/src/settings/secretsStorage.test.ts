// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginVaultSecretsRemount,
  getVaultPersistGeneration,
  persistProviderSecretsToSafeStorage,
} from "./secretsStorage";
import type { AppSettings } from "../types/settings";
import { DEFAULT_APP_SETTINGS } from "./appSettingsHydration";

describe("persistProviderSecretsToSafeStorage vault generation", () => {
  beforeEach(() => {
    beginVaultSecretsRemount();
    window.electronAPI = {
      setSecret: vi.fn(async () => ({ ok: true })),
      clearSecret: vi.fn(async () => ({ ok: true })),
    } as unknown as Window["electronAPI"];
  });

  it("does not write when generation is stale after remount", async () => {
    const generation = getVaultPersistGeneration();
    const settings: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      geminiApiKey: "AIzaSyStaleKeyShouldNotWrite000001",
    };
    beginVaultSecretsRemount();
    await persistProviderSecretsToSafeStorage(settings, generation);
    expect(window.electronAPI?.setSecret).not.toHaveBeenCalled();
  });

  it("clears vault blobs when keys are empty", async () => {
    const generation = getVaultPersistGeneration();
    const settings: AppSettings = {
      ...DEFAULT_APP_SETTINGS,
      geminiApiKey: "",
      chatProviders: {
        gemini: { apiKey: "", model: "" },
        openai: { apiKey: "", model: "" },
        anthropic: { apiKey: "", model: "" },
        custom: { apiKey: "", model: "" },
      },
    };
    await persistProviderSecretsToSafeStorage(settings, generation);
    expect(window.electronAPI?.clearSecret).toHaveBeenCalledWith("geminiApiKey");
    expect(window.electronAPI?.setSecret).not.toHaveBeenCalled();
  });
});
