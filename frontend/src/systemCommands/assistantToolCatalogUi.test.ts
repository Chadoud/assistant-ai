import { describe, expect, it } from "vitest";
import { SYSTEM_COMMAND_CATALOG, type SystemCommandIdV1 } from "./catalog";
import {
  ASSISTANT_TOOL_CATALOG_UI_GROUPS,
  ASSISTANT_TOOL_CATALOG_UI_IDS_ORDERED,
  isAssistantToolInstalledForCatalog,
  toggleAssistantCatalogToolInstall,
} from "./assistantToolCatalogUi";

describe("ASSISTANT_TOOL_CATALOG_UI_GROUPS", () => {
  it("covers every catalog command id exactly once", () => {
    const catalogIds = Object.keys(SYSTEM_COMMAND_CATALOG) as SystemCommandIdV1[];
    const flat = ASSISTANT_TOOL_CATALOG_UI_GROUPS.flatMap((g) => [...g.ids]);
    expect(ASSISTANT_TOOL_CATALOG_UI_IDS_ORDERED).toEqual(flat);
    expect(flat.length).toBe(catalogIds.length);
    const seen = new Set<SystemCommandIdV1>();
    for (const id of flat) {
      expect(seen.has(id), `duplicate UI entry: ${id}`).toBe(false);
      seen.add(id);
    }
    for (const id of catalogIds) {
      expect(seen.has(id), `missing UI entry: ${id}`).toBe(true);
    }
  });
});

describe("assistant catalog install state", () => {
  const first = ASSISTANT_TOOL_CATALOG_UI_IDS_ORDERED[0];
  const second = ASSISTANT_TOOL_CATALOG_UI_IDS_ORDERED[1];

  it("treats null as all tools installed", () => {
    expect(isAssistantToolInstalledForCatalog(null, first)).toBe(true);
    expect(isAssistantToolInstalledForCatalog(undefined, first)).toBe(true);
  });

  it("uninstall removes one id until full set restores null", () => {
    const oneRemoved = toggleAssistantCatalogToolInstall(null, first, "uninstall");
    expect(oneRemoved).not.toBe(null);
    expect(oneRemoved!.includes(first)).toBe(false);
    expect(isAssistantToolInstalledForCatalog(oneRemoved, first)).toBe(false);
    expect(isAssistantToolInstalledForCatalog(oneRemoved, second)).toBe(true);

    const restored = toggleAssistantCatalogToolInstall(oneRemoved, first, "install");
    expect(restored).toBe(null);
  });
});
