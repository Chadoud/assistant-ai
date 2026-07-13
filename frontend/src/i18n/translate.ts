import type { UiLocale } from "./locale";
import { getCachedLocaleBundle, getEnglishBundle } from "./localeBundles";

export function getString(tree: unknown, key: string): string | undefined {
  const parts = key.split(".");
  let cur: unknown = tree;
  for (const p of parts) {
    if (cur !== null && typeof cur === "object" && p in cur) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return typeof cur === "string" ? cur : undefined;
}

function bundleForLocale(locale: UiLocale): Record<string, unknown> | undefined {
  if (locale === "en") return getEnglishBundle();
  return getCachedLocaleBundle(locale);
}

/** Resolve message for locale, falling back to English then to the key. */
export function translate(
  locale: UiLocale,
  key: string,
  vars?: Record<string, string | number>
): string {
  const primary = getString(bundleForLocale(locale), key);
  let raw = primary !== undefined ? primary : getString(getEnglishBundle(), key);
  if (raw === undefined) return key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      raw = raw.replaceAll(`{${k}}`, String(v));
    }
  }
  return raw;
}
