import { describe, expect, test } from "vitest";
import { getString } from "../i18n/translate";
import de from "../i18n/locales/de";
import en from "../i18n/locales/en";
import fr from "../i18n/locales/fr";
import itLocale from "../i18n/locales/it";

/** Keys used by `useCommandPaletteCommands` for Settings deep links — must exist in every locale bundle. */
const SETTINGS_GO_COMMAND_KEYS = [
  "commands.settingsGoAccount",
  "commands.settingsGoModels",
  "commands.settingsGoDownloadModels",
  "commands.settingsGoAssistants",
  "commands.settingsGoChatProvider",
  "commands.settingsGoIntegrations",
  "commands.settingsGoPrivacy",
  "commands.settingsGoSystem",
  "commands.settingsGoLicense",
  "commands.settingsGoOutputFolder",
  "commands.settingsGoRules",
  "commands.settingsGoAssistantTools",
] as const;

const bundles = { en, fr, it: itLocale, de } as const;

describe("command palette Settings jump labels", () => {
  test.each([...SETTINGS_GO_COMMAND_KEYS])("defines %s in all locales", (key) => {
    for (const [locale, tree] of Object.entries(bundles)) {
      const value = getString(tree, key);
      expect(value, locale).toBeTruthy();
      expect(value, locale).not.toMatch(/^commands\./);
    }
  });
});
