import { describe, expect, it } from "vitest";
import { DEFAULT_APP_SETTINGS } from "../settings/appSettingsHydration";
import { sortClassifyPayloadForJob } from "./sortClassifyPayload";
import type { SortStructureTemplate } from "../types/sortStructure";
import { DEFAULT_SORT_STRUCTURE_TEMPLATE } from "../types/sortStructure";

const structureEnabled: SortStructureTemplate = {
  version: 1,
  enabled: true,
  modules: [
    {
      id: "a",
      theme: "document_type",
      children: [],
      maxFolders: null,
      customLabel: "",
      overflowPolicy: "send_to_uncertain",
    },
  ],
};

describe("sortClassifyPayloadForJob", () => {
  it("omits both fields in builtin mode", () => {
    const settings = {
      ...DEFAULT_APP_SETTINGS,
      sortClassifyMode: "builtin" as const,
      sortSystemPrompt: "custom text",
      sortStructureTemplate: structureEnabled,
    };
    expect(sortClassifyPayloadForJob(settings)).toEqual({});
  });

  it("sends structure template only in structure mode", () => {
    const settings = {
      ...DEFAULT_APP_SETTINGS,
      sortClassifyMode: "structure" as const,
      sortSystemPrompt: "custom text",
      sortStructureTemplate: structureEnabled,
    };
    const payload = sortClassifyPayloadForJob(settings);
    expect(payload.sort_system_prompt).toBeUndefined();
    expect(payload.sort_structure_template).toBeDefined();
    expect((payload.sort_structure_template as { enabled: boolean }).enabled).toBe(true);
  });

  it("sends custom prompt only in custom mode", () => {
    const settings = {
      ...DEFAULT_APP_SETTINGS,
      sortClassifyMode: "custom" as const,
      sortSystemPrompt: "  my prompt  ",
      sortStructureTemplate: structureEnabled,
    };
    const payload = sortClassifyPayloadForJob(settings);
    expect(payload.sort_structure_template).toBeUndefined();
    expect(payload.sort_system_prompt).toBe("my prompt");
  });

  it("structure mode with disabled template sends nothing", () => {
    const settings = {
      ...DEFAULT_APP_SETTINGS,
      sortClassifyMode: "structure" as const,
      sortStructureTemplate: { ...DEFAULT_SORT_STRUCTURE_TEMPLATE, enabled: false },
    };
    expect(sortClassifyPayloadForJob(settings)).toEqual({});
  });
});
