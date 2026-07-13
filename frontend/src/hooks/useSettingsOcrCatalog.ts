import { useCallback, useMemo, useState } from "react";
import type { AppSettings } from "../types/settings";
import type { UseModelsReturn } from "./useModels";
import {
  TESSERACT_OCR_CATALOG_CODES,
  TESSERACT_OCR_LANG_CATALOG,
  TESSERACT_OCR_SPECIAL_CODES,
  textOcrPacksInstalled,
} from "../utils/tesseractLangCatalog";

interface UseSettingsOcrCatalogOptions {
  settings: AppSettings;
  modelHook: UseModelsReturn;
  onSettingsPatch: (patch: Partial<AppSettings>) => void;
  t: (key: string) => string;
}

/**
 * OCR pack picker state: search, derived catalog rows, and toggle handler for Settings.
 */
export function useSettingsOcrCatalog({ settings, modelHook, onSettingsPatch, t }: UseSettingsOcrCatalogOptions) {
  const [ocrSearch, setOcrSearch] = useState("");

  const rawInstalled = useMemo(() => modelHook.ocrInfo?.languages ?? [], [modelHook.ocrInfo]);
  const textInstalledLangs = useMemo(() => textOcrPacksInstalled(rawInstalled), [rawInstalled]);
  const allMode = settings.ocrLanguages.length === 0;
  const effectiveOcrCodes = useMemo(() => {
    if (allMode) return textInstalledLangs;
    return settings.ocrLanguages
      .map((c) => c.trim().toLowerCase())
      .filter((c) => c && !TESSERACT_OCR_SPECIAL_CODES.has(c));
  }, [allMode, settings.ocrLanguages, textInstalledLangs]);

  const ocrCatalogRows = useMemo(() => {
    const q = ocrSearch.trim().toLowerCase();
    const base = TESSERACT_OCR_LANG_CATALOG.filter(
      (e) => !q || e.code.toLowerCase().includes(q) || e.label.toLowerCase().includes(q)
    );
    const extraFromDisk = textInstalledLangs.filter((c) => !TESSERACT_OCR_CATALOG_CODES.has(c));
    const extraEntries = extraFromDisk.map((code) => ({ code, label: `${code} ${t("settings.ocrExtraInstalled")}` }));
    return [...extraEntries, ...base];
  }, [ocrSearch, textInstalledLangs, t]);

  const toggleOcrLanguagePack = useCallback(
    (code: string) => {
      const c = code.trim().toLowerCase();
      if (!c || TESSERACT_OCR_SPECIAL_CODES.has(c)) return;

      if (allMode) {
        if (textInstalledLangs.includes(c)) {
          const next = textInstalledLangs.filter((x) => x !== c);
          if (next.length === 0) return;
          onSettingsPatch({ ocrLanguages: next });
        } else {
          onSettingsPatch({ ocrLanguages: [...textInstalledLangs, c] });
        }
        return;
      }
      if (settings.ocrLanguages.map((x) => x.toLowerCase()).includes(c)) {
        const next = settings.ocrLanguages.filter((x) => x.toLowerCase() !== c);
        onSettingsPatch({ ocrLanguages: next.length ? next : [] });
      } else {
        onSettingsPatch({ ocrLanguages: [...settings.ocrLanguages, c] });
      }
    },
    [allMode, onSettingsPatch, settings.ocrLanguages, textInstalledLangs]
  );

  const textLangCount = textInstalledLangs.length;
  const osdOnly =
    rawInstalled.length > 0 && textLangCount === 0 && rawInstalled.some((x) => x.toLowerCase() === "osd");

  return {
    ocrSearch,
    setOcrSearch,
    rawInstalled,
    textInstalledLangs,
    allMode,
    effectiveOcrCodes,
    ocrCatalogRows,
    toggleOcrLanguagePack,
    textLangCount,
    osdOnly,
  };
}
