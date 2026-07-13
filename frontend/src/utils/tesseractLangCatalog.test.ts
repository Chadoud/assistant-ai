import { describe, expect, it } from "vitest";
import {
  DEFAULT_OCR_TESSERACT_LANGUAGE_CODES,
  TESSERACT_OCR_CATALOG_CODES,
  tessLangDisplayLabel,
} from "./tesseractLangCatalog";

describe("tessLangDisplayLabel", () => {
  it("maps ISO-style codes to catalog labels", () => {
    expect(tessLangDisplayLabel("bul")).toBe("Bulgarian");
    expect(tessLangDisplayLabel("bod")).toBe("Tibetan");
    expect(tessLangDisplayLabel("cat")).toBe("Catalan");
  });

  it("formats script/ ids", () => {
    expect(tessLangDisplayLabel("script/Arabic")).toContain("Arabic");
  });

  it("passes through unknown codes", () => {
    expect(tessLangDisplayLabel("custom_pack_1")).toBe("custom_pack_1");
  });
});

describe("DEFAULT_OCR_TESSERACT_LANGUAGE_CODES", () => {
  it("only includes known catalog codes", () => {
    for (const c of DEFAULT_OCR_TESSERACT_LANGUAGE_CODES) {
      expect(TESSERACT_OCR_CATALOG_CODES.has(c), c).toBe(true);
    }
    expect(DEFAULT_OCR_TESSERACT_LANGUAGE_CODES.length).toBeGreaterThanOrEqual(8);
  });
});
