import { describe, expect, it } from "vitest";
import { DEFAULT_APP_SETTINGS } from "../settings/appSettingsHydration";
import { messageNeedsLocalAppService } from "./messageNeedsLocalAppService";

describe("messageNeedsLocalAppService", () => {
  it("detects sort and integration intents", () => {
    expect(messageNeedsLocalAppService("sort my downloads folder")).toBe(true);
    expect(messageNeedsLocalAppService("connect my Gmail account")).toBe(true);
    expect(messageNeedsLocalAppService("what is the capital of France?")).toBe(false);
  });

  it("detects tool-style actions when assistant tools are enabled", () => {
    const settings = { ...DEFAULT_APP_SETTINGS, assistantToolsEnabled: true };
    expect(messageNeedsLocalAppService("open Safari", settings)).toBe(true);
    expect(messageNeedsLocalAppService("hello there", settings)).toBe(false);
  });
});
