import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../../i18n/I18nContext";
import { SortWizardStepper } from "./SortWizardStepper";

describe("SortWizardStepper", () => {
  it("renders connected track without bordered step cards", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="en">
        <SortWizardStepper step={2} hasSourceSelected onStepClick={() => {}} t={(k) => k} />
      </I18nProvider>,
    );
    expect(html).toContain("Sources");
    expect(html).toContain("Structure");
    expect(html).not.toContain("border-accent/40");
    expect(html).toContain("rounded-full");
  });

  it("marks later steps as disabled when no source is selected", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="en">
        <SortWizardStepper step={1} hasSourceSelected={false} onStepClick={() => {}} t={(k) => k} />
      </I18nProvider>,
    );
    expect(html).toContain('aria-disabled="true"');
  });
});
