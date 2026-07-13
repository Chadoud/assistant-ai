import { useCallback, useRef, useState } from "react";
import type { AppSettings, UiLocale } from "../../types/settings";
import { UI_LOCALES, UI_LOCALE_META } from "../../i18n/locale";
import { SECTION_LABEL_CLASS } from "../../utils/styles";
import SelectDropdown, {
  SELECT_DROPDOWN_PANEL_CLASS,
  selectDropdownPlainOptionClassName,
} from "../ui/SelectDropdown";
import { useI18n } from "../../i18n/I18nContext";

type SettingsAppLanguageSectionProps = {
  settings: AppSettings;
  onSettingsPatch: (patch: Partial<AppSettings>) => void;
};

/** App UI language — same choices as the title bar, also available in Settings. */
export default function SettingsAppLanguageSection({
  settings,
  onSettingsPatch,
}: SettingsAppLanguageSectionProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const setLocale = useCallback(
    (locale: UiLocale) => {
      onSettingsPatch({ uiLocale: locale });
      setOpen(false);
      triggerRef.current?.focus();
    },
    [onSettingsPatch]
  );

  return (
    <section id="settings-app-language" className="space-y-2">
      <label className={SECTION_LABEL_CLASS} htmlFor="settings-ui-locale">
        {t("settings.appLanguageLabel")}
      </label>
      <p className="text-2xs text-muted leading-relaxed max-w-xl">{t("settings.appLanguageHint")}</p>
      <div className="max-w-xs">
        <SelectDropdown
          open={open}
          onOpenChange={setOpen}
          triggerRef={triggerRef}
          triggerId="settings-ui-locale"
          triggerLabel={UI_LOCALE_META[settings.uiLocale].native}
          ariaLabel={t("settings.appLanguageLabel")}
        >
          <div role="listbox" aria-label={t("settings.appLanguageLabel")} className={SELECT_DROPDOWN_PANEL_CLASS}>
            {UI_LOCALES.map((locale) => (
              <button
                key={locale}
                type="button"
                role="option"
                aria-selected={settings.uiLocale === locale}
                onClick={() => setLocale(locale)}
                className={selectDropdownPlainOptionClassName(settings.uiLocale === locale)}
              >
                {UI_LOCALE_META[locale].native}
                <span className="ml-1.5 text-muted">({UI_LOCALE_META[locale].label})</span>
              </button>
            ))}
          </div>
        </SelectDropdown>
      </div>
    </section>
  );
}
