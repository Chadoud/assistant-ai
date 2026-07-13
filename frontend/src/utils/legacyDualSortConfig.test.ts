import { describe, expect, it } from "vitest";
import { DEFAULT_APP_SETTINGS } from "../settings/appSettingsHydration";
import { hasLegacyDualSortConfig } from "./legacyDualSortConfig";
import { DEFAULT_SORT_STRUCTURE_TEMPLATE } from "../types/sortStructure";

describe("hasLegacyDualSortConfig", () => {
  it("is true when structure mode with both template and prompt saved", () => {
    expect(
      hasLegacyDualSortConfig({
        ...DEFAULT_APP_SETTINGS,
        sortClassifyMode: "structure",
        sortSystemPrompt: "Keep invoices separate",
        sortStructureTemplate: {
          ...DEFAULT_SORT_STRUCTURE_TEMPLATE,
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
      })
    ).toBe(true);
  });

  it("is false in custom mode even with both saved", () => {
    expect(
      hasLegacyDualSortConfig({
        ...DEFAULT_APP_SETTINGS,
        sortClassifyMode: "custom",
        sortSystemPrompt: "x",
        sortStructureTemplate: {
          ...DEFAULT_SORT_STRUCTURE_TEMPLATE,
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
      })
    ).toBe(false);
  });
});
