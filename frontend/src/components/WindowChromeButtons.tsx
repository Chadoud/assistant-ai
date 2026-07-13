import type { CSSProperties } from "react";
import { useI18n } from "../i18n/I18nContext";
import { isMacElectronClient } from "../utils/platform";

type WindowChromeButtonsProps = {
  className?: string;
};

/**
 * Frameless-window minimize / maximize / close — Windows and Linux Electron only.
 */
export default function WindowChromeButtons({ className = "" }: WindowChromeButtonsProps) {
  const { t } = useI18n();

  if (isMacElectronClient()) return null;

  const minimize = () => window.electronAPI?.minimizeWindow?.();
  const maximize = () => window.electronAPI?.maximizeWindow?.();
  const close = () => window.electronAPI?.closeWindow?.();

  return (
    <div
      className={`flex items-center gap-1 ${className}`.trim()}
      style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
    >
      <button
        type="button"
        onClick={minimize}
        className="w-7 h-7 rounded-lg flex items-center justify-center text-muted hover:text-text-primary hover:bg-hover-overlay transition-colors"
        title={t("titleBar.minimize")}
        aria-label={t("titleBar.minimizeAria")}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
        </svg>
      </button>
      <button
        type="button"
        onClick={maximize}
        className="w-7 h-7 rounded-lg flex items-center justify-center text-muted hover:text-text-primary hover:bg-hover-overlay transition-colors"
        title={t("titleBar.maximize")}
        aria-label={t("titleBar.maximizeAria")}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <rect x="4" y="4" width="16" height="16" rx="2" />
        </svg>
      </button>
      <button
        type="button"
        onClick={close}
        className="w-7 h-7 rounded-lg flex items-center justify-center text-muted hover:text-white hover:bg-red-500 transition-colors"
        title={t("titleBar.close")}
        aria-label={t("titleBar.closeAria")}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
