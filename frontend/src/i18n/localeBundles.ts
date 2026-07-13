import type { UiLocale } from "./locale";
import en from "./locales/en";

export type LocaleBundle = Record<string, unknown>;

const cache: Partial<Record<UiLocale, LocaleBundle>> = { en };

const loaders: Record<UiLocale, () => Promise<{ default: LocaleBundle }>> = {
  en: () => Promise.resolve({ default: en }),
  fr: () => import("./locales/fr"),
  de: () => import("./locales/de"),
  it: () => import("./locales/it"),
};

/** English bundle — always available synchronously (fallback for other locales). */
export function getEnglishBundle(): LocaleBundle {
  return en;
}

/** Returns a cached locale bundle when already loaded. */
export function getCachedLocaleBundle(locale: UiLocale): LocaleBundle | undefined {
  return cache[locale];
}

/** Loads and caches a locale bundle (no-op when already present). */
export async function loadLocaleBundle(locale: UiLocale): Promise<LocaleBundle> {
  const cached = cache[locale];
  if (cached) return cached;
  const mod = await loaders[locale]();
  cache[locale] = mod.default;
  return mod.default;
}

/** Preloads non-English bundles the user is unlikely to need on first paint. */
export function preloadLocaleBundle(locale: UiLocale): void {
  if (locale === "en" || cache[locale]) return;
  void loadLocaleBundle(locale);
}
