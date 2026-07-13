import { describe, expect, it } from "vitest";
import { parseStructurePackJson } from "./sortStructurePack";

describe("parseStructurePackJson", () => {
  it("parses client-project bundled pack shape", () => {
    const tpl = parseStructurePackJson({
      id: "client-project",
      template: {
        version: 1,
        enabled: true,
        modules: [
          {
            id: "level-client",
            theme: "custom",
            customLabel: "Client",
            children: [{ id: "level-project", theme: "project", children: [] }],
          },
        ],
      },
    });
    expect(tpl.enabled).toBe(true);
    expect(tpl.modules[0].theme).toBe("custom");
    expect(tpl.modules[0].customLabel).toBe("Client");
    expect(tpl.modules[0].children[0].theme).toBe("project");
  });
});
