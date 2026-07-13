import type { SortRequest } from "../api";
import type { AppSettings } from "../types/settings";
import { TESSERACT_OCR_SPECIAL_CODES, textOcrPacksInstalled } from "./tesseractLangCatalog";

/**
 * Build OCR fields for POST /analyze.
 * - `ocrLanguages` empty → all **text** packs seen by the desktop probe (`osd` / `equ` excluded).
 * - Non-empty → explicit whitelist (may include packs not installed yet). `osd` / `equ` are stripped.
 */
export function buildAnalyzeOcrPayload(
  settings: Pick<AppSettings, "ocrLanguages">,
  installedTesseractLangs: string[] | undefined
): Partial<Pick<SortRequest, "tesseract_langs" | "tesseract_auto">> {
  const fromProbe = textOcrPacksInstalled(installedTesseractLangs);
  const useAllInstalled = settings.ocrLanguages.length === 0;
  const langs = useAllInstalled
    ? fromProbe
    : settings.ocrLanguages.map((c) => c.trim().toLowerCase()).filter((c) => c && !TESSERACT_OCR_SPECIAL_CODES.has(c));
  if (langs.length > 0) {
    return { tesseract_langs: langs, tesseract_auto: true };
  }
  return {};
}
