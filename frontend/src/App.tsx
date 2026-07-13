import { useAppSettings } from "./hooks/useAppSettings";
import { useGlobalErrorToasts } from "./hooks/useGlobalErrorToasts";
import { I18nProvider } from "./i18n/I18nContext";
import { parseUiLocale } from "./i18n/locale";
import { AppShell } from "./AppShell";

export default function App() {
  const { settings, setSettings, hydrated } = useAppSettings();
  const uiLocale = parseUiLocale(settings.uiLocale);
  useGlobalErrorToasts(uiLocale);
  return (
    <I18nProvider locale={uiLocale}>
      <AppShell
        settings={settings}
        setSettings={setSettings}
        hydrated={hydrated}
        uiLocale={uiLocale}
      />
    </I18nProvider>
  );
}
