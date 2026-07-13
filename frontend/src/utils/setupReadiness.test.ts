import { describe, expect, it } from "vitest";
import { DEFAULT_APP_SETTINGS } from "../settings/appSettingsHydration";
import { isSortSetupComplete, isWelcomeSetupComplete } from "./setupReadiness";

describe("setupReadiness", () => {
  it("sort setup requires output folder and sort model", () => {
    expect(isSortSetupComplete(DEFAULT_APP_SETTINGS)).toBe(false);
    expect(
      isSortSetupComplete({
        ...DEFAULT_APP_SETTINGS,
        outputDir: "/tmp/out",
        model: "llama3.2",
      })
    ).toBe(true);
  });

  it("cloud sort setup only requires output folder", () => {
    expect(
      isSortSetupComplete(
        { ...DEFAULT_APP_SETTINGS, outputDir: "/tmp/out" },
        { remoteSortLlm: true }
      )
    ).toBe(true);
  });

  it("welcome setup completes with output folder when cloud sort is active", () => {
    expect(
      isWelcomeSetupComplete(
        { ...DEFAULT_APP_SETTINGS, outputDir: "/tmp/out" },
        { remoteSortLlm: true }
      )
    ).toBe(true);
  });

  it("welcome setup accepts Gemini without a sort model", () => {
    expect(
      isWelcomeSetupComplete({
        ...DEFAULT_APP_SETTINGS,
        outputDir: "/tmp/out",
        geminiApiKey: "AIzaSy0123456789012345678901234567890",
      })
    ).toBe(true);
    expect(isSortSetupComplete({
      ...DEFAULT_APP_SETTINGS,
      outputDir: "/tmp/out",
      geminiApiKey: "AIzaSy0123456789012345678901234567890",
    })).toBe(false);
  });

  it("welcome setup still requires an output folder", () => {
    expect(
      isWelcomeSetupComplete({
        ...DEFAULT_APP_SETTINGS,
        geminiApiKey: "AIzaSy0123456789012345678901234567890",
      })
    ).toBe(false);
  });
});
