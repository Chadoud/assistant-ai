import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { UiLocale } from "./locale";
import { loadLocaleBundle } from "./localeBundles";
import { translate } from "./translate";

type TI18n = {
  locale: UiLocale;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<TI18n | null>(null);

export function I18nProvider({
  locale,
  children,
}: {
  locale: UiLocale;
  children: ReactNode;
}) {
  const [bundleEpoch, setBundleEpoch] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void loadLocaleBundle(locale).then(() => {
      if (!cancelled) setBundleEpoch((value) => value + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale, bundleEpoch]
  );

  const value = useMemo(() => ({ locale, t }), [locale, t]);

  useEffect(() => {
    document.documentElement.lang = locale === "en" ? "en" : locale;
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): TI18n {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return ctx;
}
