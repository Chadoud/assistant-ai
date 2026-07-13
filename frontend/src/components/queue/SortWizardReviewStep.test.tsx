import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../../i18n/I18nContext";
import { DEFAULT_APP_SETTINGS } from "../../settings/appSettingsHydration";
import { SortWizardReviewStep } from "./SortWizardReviewStep";

describe("SortWizardReviewStep", () => {
  it("shows structure flow preview when structure mode has modules", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="en">
        <SortWizardReviewStep
          settings={{
            ...DEFAULT_APP_SETTINGS,
            sortClassifyMode: "structure",
            sortStructureTemplate: {
              version: 1,
              enabled: true,
              modules: [
                {
                  id: "root",
                  theme: "country",
                  maxFolders: null,
                  overflowPolicy: "send_to_uncertain",
                  children: [
                    {
                      id: "child",
                      theme: "property",
                      maxFolders: null,
                      overflowPolicy: "send_to_uncertain",
                      children: [],
                    },
                  ],
                },
              ],
            },
          }}
          selectedSourcesSummary={[{ id: "gmail", label: "Gmail" }]}
        />
      </I18nProvider>,
    );
    expect(html).toContain("sort-wizard-structure-preview");
    expect(html).toContain("structure-flow-preview");
    expect(html).toContain("Country");
    expect(html).not.toContain("Next sort");
    expect(html).not.toContain("Folder structure");
  });

  it("shows one-line grouping summary for automatic mode", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="en">
        <SortWizardReviewStep
          settings={DEFAULT_APP_SETTINGS}
          selectedSourcesSummary={[{ id: "gmail", label: "Gmail" }]}
        />
      </I18nProvider>,
    );
    expect(html).not.toContain("sort-wizard-structure-preview");
    expect(html).toContain("AI chooses folders automatically");
  });
});
