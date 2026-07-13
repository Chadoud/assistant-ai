import { describe, expect, it } from "vitest";
import { SETTINGS_NAV_ENTRIES } from "./settingsNav";
import { filterSettingsSearchResults } from "./settingsPanelSearch";

const mockT = (key: string): string => {
  const table: Record<string, string> = {
    "settings.nav.privacyTelemetry": "Usage data & feedback",
    "settings.privacyTelemetryLabel": "Usage analytics",
    "settings.privacyTelemetryDisclosure": "Included when you use Exo",
    "settings.nav.features": "Features",
    "settings.features.emailSearch.title": "Search email",
    "settings.features.emailSearch.body": "Find messages in Gmail or Outlook.",
    "settings.voiceAutoStartLabel": "Auto-start microphone on launch",
    "settings.nav.sortingScans": "Scans & photos",
    "settings.ocrPacks": "OCR language packs",
    "settings.nav.chatGemini": "Gemini",
    "settings.appLanguageLabel": "App language",
    "settings.nav.sortingRulesAuto": "Rules & automation",
    "settings.systemTitle": "App health",
    "settings.nav.systemDiagnostics": "App health",
    "settings.nav.appStatus": "App status",
    "settings.appStatus.localService": "Local app service",
    "settings.assistantToolCatalogItems.gmail_search_messages.title": "Search Gmail",
    "settings.assistantToolCatalogItems.gmail_search_messages.body":
      "Find messages in your connected Gmail account.",
  };
  return table[key] ?? key;
};

describe("filterSettingsSearchResults", () => {
  it("returns all entries when query is empty", () => {
    const results = filterSettingsSearchResults("", SETTINGS_NAV_ENTRIES, mockT, "");
    expect(results).toHaveLength(SETTINGS_NAV_ENTRIES.length);
  });

  it("matches nav label text", () => {
    const results = filterSettingsSearchResults("assistant", SETTINGS_NAV_ENTRIES, mockT, "");
    expect(results.some((r) => r.id === "settings-anchor-features")).toBe(true);
  });

  it("matches in-section content via i18n keys", () => {
    const results = filterSettingsSearchResults("Included when", SETTINGS_NAV_ENTRIES, mockT, "");
    expect(results.some((r) => r.id === "settings-privacy" || r.id === "settings-anchor-privacy")).toBe(
      true
    );
  });

  it("matches feature catalog copy", () => {
    const results = filterSettingsSearchResults("gmail", SETTINGS_NAV_ENTRIES, mockT, "");
    expect(results.some((r) => r.id === "settings-anchor-features")).toBe(true);
  });

  it("includes expand ids for app language subsection", () => {
    const results = filterSettingsSearchResults("language", SETTINGS_NAV_ENTRIES, mockT, "");
    const lang = results.find((r) => r.id === "settings-app-language");
    expect(lang?.expandSectionIds).toContain("settings-app-language");
  });

  it("matches subsection title App health", () => {
    const results = filterSettingsSearchResults("app health", SETTINGS_NAV_ENTRIES, mockT, "sorting-rules");
    expect(results.some((r) => r.id === "settings-anchor-system")).toBe(true);
    expect(results.find((r) => r.id === "settings-anchor-system")?.expandSectionIds).toContain(
      "system-status"
    );
  });

  it("matches Local app service subsection label", () => {
    const results = filterSettingsSearchResults("local app service", SETTINGS_NAV_ENTRIES, mockT, "");
    expect(results.some((r) => r.id === "settings-anchor-system")).toBe(true);
  });

  it("does not pin the active section when it does not match the query", () => {
    const results = filterSettingsSearchResults("app health", SETTINGS_NAV_ENTRIES, mockT, "sorting-rules");
    expect(results.some((r) => r.id === "sorting-rules")).toBe(false);
  });
});
