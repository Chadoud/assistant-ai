import { describe, expect, it } from "vitest";
import type { AppSettings } from "../types/settings";
import {
  GOOGLE_INTEGRATION_PROVIDER_IDS,
  INFOMANIAK_INTEGRATION_PROVIDER_IDS,
  MS_GRAPH_PROVIDER_IDS,
  isAssistantIntegrationProviderConnected,
  isAssistantIntegrationProviderEnabled,
} from "./assistantIntegrationProviders";

const settings = {
  assistantToolsProviderMicrosoft: false,
  assistantToolsProviderGoogle: false,
  assistantToolsProviderInfomaniak: false,
} as AppSettings;

describe("assistantIntegrationProviders", () => {
  it("detects Microsoft when any Graph slot is connected", () => {
    expect(isAssistantIntegrationProviderConnected("microsoft", new Set(["outlook"]))).toBe(true);
    expect(isAssistantIntegrationProviderConnected("microsoft", new Set())).toBe(false);
  });

  it("prefers live connections over persisted settings flags", () => {
    const connected = new Set([GOOGLE_INTEGRATION_PROVIDER_IDS[0]]);
    expect(isAssistantIntegrationProviderEnabled("google", settings, connected)).toBe(true);
    expect(isAssistantIntegrationProviderEnabled("microsoft", settings, connected)).toBe(false);
  });

  it("falls back to settings when connection state is unknown", () => {
    expect(
      isAssistantIntegrationProviderEnabled(
        "microsoft",
        { ...settings, assistantToolsProviderMicrosoft: true },
        null
      )
    ).toBe(true);
  });

  it("exports stable provider id lists", () => {
    expect(MS_GRAPH_PROVIDER_IDS.length).toBeGreaterThan(0);
    expect(GOOGLE_INTEGRATION_PROVIDER_IDS.length).toBeGreaterThan(0);
    expect(INFOMANIAK_INTEGRATION_PROVIDER_IDS.length).toBeGreaterThan(0);
  });
});
