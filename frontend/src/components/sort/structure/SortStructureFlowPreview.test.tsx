import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../../../i18n/I18nContext";
import { SortStructureFlowPreview } from "./SortStructureFlowPreview";

describe("SortStructureFlowPreview", () => {
  it("renders level cards for a module chain", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="en">
        <SortStructureFlowPreview
          modules={[
            {
              id: "root",
              theme: "country",
              maxFolders: null,
              overflowPolicy: "send_to_uncertain",
              children: [
                {
                  id: "child",
                  theme: "auto",
                  maxFolders: null,
                  overflowPolicy: "send_to_uncertain",
                  children: [],
                },
              ],
            },
          ]}
        />
      </I18nProvider>
    );
    expect(html).toContain("structure-flow-preview");
    expect(html).toContain("Level 1");
    expect(html).toContain("Level 2");
  });

  it("returns null for empty modules", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="en">
        <SortStructureFlowPreview modules={[]} />
      </I18nProvider>
    );
    expect(html).toBe("");
  });
});
