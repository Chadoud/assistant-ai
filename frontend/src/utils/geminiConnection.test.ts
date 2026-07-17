import { describe, expect, it } from "vitest";
import { DEFAULT_APP_SETTINGS } from "../settings/appSettingsHydration";
import {
  GEMINI_SECRET_MASK,
  apiKeyForBackendRequest,
  isGeminiConnectedInSettings,
  isProviderApiKeyPresent,
  isSecretMask,
  resolveGeminiApiKeyRaw,
} from "./geminiConnection";

const LEGACY_KEY = "AIzaSy0123456789012345678901234567890";

describe("isGeminiConnectedInSettings", () => {
  it("is true for a plausible Gemini key", () => {
    expect(
      isGeminiConnectedInSettings({
        ...DEFAULT_APP_SETTINGS,
        geminiApiKey: LEGACY_KEY,
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

  it("is true when only chatProviders.gemini has the mask", () => {
    expect(
      isGeminiConnectedInSettings({
        ...DEFAULT_APP_SETTINGS,
        chatProviders: { gemini: { apiKey: GEMINI_SECRET_MASK, model: "gemini-2.5-flash" } },
      }),
    ).toBe(true);
  });

  it("is false when unset", () => {
    expect(isGeminiConnectedInSettings(DEFAULT_APP_SETTINGS)).toBe(false);
  });
});

describe("resolveGeminiApiKeyRaw / mask helpers", () => {
  it("returns raw key when format-plausible", () => {
    expect(
      resolveGeminiApiKeyRaw({
        ...DEFAULT_APP_SETTINGS,
        geminiApiKey: LEGACY_KEY,
      }),
    ).toBe(LEGACY_KEY);
  });

  it("returns empty for mask-only", () => {
    expect(
      resolveGeminiApiKeyRaw({
        ...DEFAULT_APP_SETTINGS,
        geminiApiKey: GEMINI_SECRET_MASK,
      }),
    ).toBe("");
  });

  it("apiKeyForBackendRequest strips the mask", () => {
    expect(apiKeyForBackendRequest(GEMINI_SECRET_MASK)).toBe("");
    expect(apiKeyForBackendRequest(LEGACY_KEY)).toBe(LEGACY_KEY);
    expect(isSecretMask(GEMINI_SECRET_MASK)).toBe(true);
  });

  it("isProviderApiKeyPresent accepts mask and raw keys", () => {
    expect(isProviderApiKeyPresent(GEMINI_SECRET_MASK)).toBe(true);
    expect(isProviderApiKeyPresent(LEGACY_KEY)).toBe(true);
    expect(isProviderApiKeyPresent("")).toBe(false);
  });
});
