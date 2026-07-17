import { SETTINGS_STORAGE_KEY } from "../../constants";
import type { AppSettings } from "../../types/settings";

/** Read brain-map prefs from persisted settings (avoids prop drilling through lazy panels). */
export function readBrainMapPrefs(): Pick<
  AppSettings,
  | "brainMapIncludeMailTasks"
  | "brainMapIncludeLowValueChats"
  | "telemetryOptIn"
  | "uiLocale"
  | "outputDir"
> {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return {
        brainMapIncludeMailTasks: false,
        brainMapIncludeLowValueChats: false,
        telemetryOptIn: true,
        uiLocale: "en",
        outputDir: "",
      };
    }
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      brainMapIncludeMailTasks: parsed.brainMapIncludeMailTasks === true,
      brainMapIncludeLowValueChats: parsed.brainMapIncludeLowValueChats === true,
      telemetryOptIn: parsed.telemetryOptIn !== false,
      uiLocale: typeof parsed.uiLocale === "string" ? parsed.uiLocale : "en",
      outputDir: typeof parsed.outputDir === "string" ? parsed.outputDir : "",
    };
  } catch {
    return {
      brainMapIncludeMailTasks: false,
      brainMapIncludeLowValueChats: false,
      telemetryOptIn: true,
      uiLocale: "en",
      outputDir: "",
    };
  }
}
