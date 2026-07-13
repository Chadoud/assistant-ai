import { describe, expect, it } from "vitest";
import type { Job } from "../api";
import type { AppSettings } from "../types/settings";
import { DEFAULT_SORT_STRUCTURE_TEMPLATE } from "../types/sortStructure";
import { isSortStructureJobConfig, resolveStructureModulesForActiveJob } from "./sortStructureJobConfig";

describe("isSortStructureJobConfig", () => {
  it("returns true when template enabled with modules", () => {
    expect(
      isSortStructureJobConfig({
        sort_structure_template: {
          enabled: true,
          modules: [{ id: "c", theme: "country", max_folders: 20, children: [] }],
        },
      })
    ).toBe(true);
  });

  it("returns false when disabled or empty", () => {
    expect(isSortStructureJobConfig(null)).toBe(false);
    expect(isSortStructureJobConfig({ sort_structure_template: { enabled: false, modules: [] } })).toBe(false);
    expect(isSortStructureJobConfig({ sort_structure_template: { enabled: true, modules: [] } })).toBe(false);
  });
});

describe("resolveStructureModulesForActiveJob", () => {
  const settings: AppSettings = {
    outputDir: "/out",
    model: "m",
    language: "English",
    sortStructureTemplate: {
      version: 1,
      enabled: true,
      modules: [{ id: "s1", theme: "country", maxFolders: null, overflowPolicy: "send_to_uncertain", children: [] }],
    },
  } as unknown as AppSettings;

  it("prefers job config modules when present", () => {
    const job = {
      config: {
        sort_structure_template: {
          enabled: true,
          modules: [{ id: "j1", theme: "auto", maxFolders: null, overflowPolicy: "send_to_uncertain", children: [] }],
        },
      },
    } as unknown as Job;
    const modules = resolveStructureModulesForActiveJob(job, settings);
    expect(modules).toHaveLength(1);
    expect(modules[0]?.id).toBe("j1");
  });

  it("falls back to settings when job has no template", () => {
    const modules = resolveStructureModulesForActiveJob({ config: {} } as Job, settings);
    expect(modules[0]?.id).toBe("s1");
  });

  it("returns empty when neither has modules", () => {
    const emptySettings = { ...settings, sortStructureTemplate: DEFAULT_SORT_STRUCTURE_TEMPLATE };
    expect(resolveStructureModulesForActiveJob(null, emptySettings)).toEqual([]);
  });
});
