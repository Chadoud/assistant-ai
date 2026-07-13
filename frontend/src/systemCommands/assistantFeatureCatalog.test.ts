import { describe, expect, it } from "vitest";
import {
  allCatalogCommandsMappedToFeatures,
  ASSISTANT_FEATURE_DEFINITIONS,
  isAssistantFeatureEnabled,
  toggleAssistantFeatureInstall,
} from "./assistantFeatureCatalog";
import { ASSISTANT_TOOL_CATALOG_UI_IDS_ORDERED } from "./assistantToolCatalogUi";

describe("assistantFeatureCatalog", () => {
  it("maps every catalog command to exactly one feature", () => {
    expect(allCatalogCommandsMappedToFeatures()).toBe(true);
    const seen = new Set<string>();
    for (const feature of ASSISTANT_FEATURE_DEFINITIONS) {
      for (const id of feature.commandIds) {
        expect(seen.has(id), `duplicate mapping for ${id}`).toBe(false);
        seen.add(id);
      }
    }
    expect(seen.size).toBe(ASSISTANT_TOOL_CATALOG_UI_IDS_ORDERED.length);
  });

  it("toggles all commands in a feature together", () => {
    const narrowed = ASSISTANT_TOOL_CATALOG_UI_IDS_ORDERED.filter(
      (id) => id !== "gmail_search_messages" && id !== "graph_mail_search"
    );
    expect(isAssistantFeatureEnabled(narrowed, "emailSearch")).toBe(false);
    const enabled = toggleAssistantFeatureInstall(narrowed, "emailSearch", true);
    expect(isAssistantFeatureEnabled(enabled, "emailSearch")).toBe(true);
    const disabled = toggleAssistantFeatureInstall(enabled, "emailSearch", false);
    expect(isAssistantFeatureEnabled(disabled, "emailSearch")).toBe(false);
  });
});
