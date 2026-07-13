import { describe, expect, it } from "vitest";
import { tourStepBundles } from "./tourStepBundles";

const LOCALE_IDS = ["en", "fr", "de", "it"] as const;

type LocaleId = (typeof LOCALE_IDS)[number];
type StepId = keyof typeof tourStepBundles.en;

describe("tour step bundles (locale parity)", () => {
  const enKeys = new Set<StepId>(Object.keys(tourStepBundles.en) as StepId[]);

  it("every locale exposes the same step ids as en (sorted match)", () => {
    for (const locale of LOCALE_IDS) {
      const keys = Object.keys(tourStepBundles[locale]).sort();
      const expected = Object.keys(tourStepBundles.en).sort();
      expect(keys, `locale ${locale}`).toEqual(expected);
    }
  });

  it("each step has a non-empty title and body in every locale", () => {
    for (const step of enKeys) {
      for (const locale of LOCALE_IDS) {
        const s = (tourStepBundles as Record<LocaleId, Record<StepId, { title: string; body: string }>>)[locale][
          step
        ];
        expect(s.title?.trim().length, `${locale} ${String(step)} title`).toBeGreaterThan(0);
        expect(s.body?.trim().length, `${locale} ${String(step)} body`).toBeGreaterThan(0);
      }
    }
  });
});
