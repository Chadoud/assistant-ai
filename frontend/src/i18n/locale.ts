import type { UiLocale } from "../types/settings";

export type { UiLocale };

export const UI_LOCALES: UiLocale[] = ["en", "fr", "it", "de"];

export const UI_LOCALE_META: Record<UiLocale, { label: string; native: string }> = {
  en: { label: "English", native: "English" },
  fr: { label: "French", native: "Français" },
  it: { label: "Italian", native: "Italiano" },
  de: { label: "German", native: "Deutsch" },
};

export function parseUiLocale(raw: unknown): UiLocale {
  if (raw === "fr" || raw === "it" || raw === "de" || raw === "en") return raw;
  return "en";
}
