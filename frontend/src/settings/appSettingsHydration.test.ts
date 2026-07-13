import { describe, expect, it } from "vitest";
import { DEFAULT_APP_SETTINGS, mergeAppSettings } from "./appSettingsHydration";

describe("diagnostics defaults (legitimate interest, objection in Settings)", () => {
  it("ships with telemetry and crash reporting enabled", () => {
    expect(DEFAULT_APP_SETTINGS.telemetryOptIn).toBe(true);
    expect(DEFAULT_APP_SETTINGS.crashReportsOptIn).toBe(true);
    expect(DEFAULT_APP_SETTINGS.diagnosticsOptOutExplicit).toBe(false);
  });

  it("enables both for a fresh profile (no persisted settings)", () => {
    const merged = mergeAppSettings({}, DEFAULT_APP_SETTINGS);
    expect(merged.telemetryOptIn).toBe(true);
    expect(merged.crashReportsOptIn).toBe(true);
  });

  it("honors a stored objection to usage analytics", () => {
    const merged = mergeAppSettings(
      {
        telemetryOptIn: false,
        crashReportsOptIn: false,
      },
      DEFAULT_APP_SETTINGS,
    );
    expect(merged.telemetryOptIn).toBe(false);
    expect(merged.crashReportsOptIn).toBe(false);
    expect(merged.diagnosticsOptOutExplicit).toBe(false);
  });
});

describe("user-friendly defaults", () => {
  it("defaults automation to balanced (not custom confidence tuning)", () => {
    expect(DEFAULT_APP_SETTINGS.automationPreset).toBe("balanced");
    expect(DEFAULT_APP_SETTINGS.minConfidence).toBeNull();
  });

  it("does not auto-start voice mic on launch", () => {
    expect(DEFAULT_APP_SETTINGS.voiceAutoStart).toBe(false);
  });
});

describe("sortClassifyMode hydration", () => {
  it("infers structure when legacy template is enabled", () => {
    const merged = mergeAppSettings(
      {
        sortStructureTemplate: {
          version: 1,
          enabled: true,
          modules: [
            {
              id: "a",
              theme: "document_type",
              children: [],
              maxFolders: null,
              overflowPolicy: "send_to_uncertain",
            },
          ],
        },
      },
      DEFAULT_APP_SETTINGS
    );
    expect(merged.sortClassifyMode).toBe("structure");
  });

  it("infers custom when only prompt is set", () => {
    const merged = mergeAppSettings({ sortSystemPrompt: "Group by vendor" }, DEFAULT_APP_SETTINGS);
    expect(merged.sortClassifyMode).toBe("custom");
  });

  it("prefers structure when both legacy fields were active", () => {
    const merged = mergeAppSettings(
      {
        sortSystemPrompt: "Extra hint",
        sortStructureTemplate: {
          version: 1,
          enabled: true,
          modules: [
            {
              id: "a",
              theme: "country",
              children: [],
              maxFolders: null,
              overflowPolicy: "send_to_uncertain",
            },
          ],
        },
      },
      DEFAULT_APP_SETTINGS
    );
    expect(merged.sortClassifyMode).toBe("structure");
    expect(merged.sortSystemPrompt).toBe("Extra hint");
  });

  it("preserves explicit sortClassifyMode from storage", () => {
    const merged = mergeAppSettings(
      {
        sortClassifyMode: "custom",
        sortSystemPrompt: "x",
        sortStructureTemplate: {
          version: 1,
          enabled: true,
          modules: [
            {
              id: "a",
              theme: "year",
              children: [],
              maxFolders: null,
              overflowPolicy: "send_to_uncertain",
            },
          ],
        },
      },
      DEFAULT_APP_SETTINGS
    );
    expect(merged.sortClassifyMode).toBe("custom");
  });
});
