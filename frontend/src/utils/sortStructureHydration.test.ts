import { describe, expect, it } from "vitest";
import { parseSortStructureTemplate } from "./sortStructureHydration";

describe("parseSortStructureTemplate", () => {
  it("parses enabled nested template", () => {
    const tpl = parseSortStructureTemplate({
      version: 1,
      enabled: true,
      modules: [
        {
          id: "c",
          theme: "country",
          max_folders: 3,
          children: [{ id: "p", theme: "property", children: [] }],
        },
      ],
    });
    expect(tpl?.enabled).toBe(true);
    expect(tpl?.modules[0].theme).toBe("country");
    expect(tpl?.modules[0].children[0].theme).toBe("property");
  });

  it("returns null for invalid version", () => {
    expect(parseSortStructureTemplate({ version: 2, enabled: true, modules: [] })).toBeNull();
  });
});
