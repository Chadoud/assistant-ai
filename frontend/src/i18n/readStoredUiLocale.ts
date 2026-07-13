import { SETTINGS_STORAGE_KEY } from "../constants";
import { parseUiLocale, type UiLocale } from "./locale";
import { translate } from "./translate";

/**
 * Read UI locale from persisted settings without the React i18n provider.
 * Used by last-resort surfaces (e.g. ErrorBoundary) that mount above `I18nProvider`.
 */
function readStoredUiLocale(): UiLocale {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return "en";
    const parsed = JSON.parse(raw) as { uiLocale?: unknown };
    return parseUiLocale(parsed.uiLocale);
  } catch {
    return "en";
  }
}

/** Translate using locale from localStorage — safe outside `I18nProvider`. */
export function translateStored(key: string, vars?: Record<string, string | number>): string {
  return translate(readStoredUiLocale(), key, vars);
}
