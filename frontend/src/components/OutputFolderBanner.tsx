import { useEffect, useState } from "react";
import { DEFAULT_SORT_OUTPUT_FOLDER_LABEL } from "../constants";
import { useI18n } from "../i18n/I18nContext";

interface OutputFolderBannerProps {
  onClick: () => void;
}

/**
 * Shown when `outputDir` is still empty (e.g. welcome dev scenario): explains the default
 * Documents folder the app will create on first sort — optional link to Settings.
 */
export default function OutputFolderBanner({ onClick }: OutputFolderBannerProps) {
  const { t } = useI18n();
  const [resolvedPath, setResolvedPath] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.electronAPI?.getDefaultOutputDir?.().then((dir) => {
      if (!cancelled && typeof dir === "string" && dir.trim()) setResolvedPath(dir.trim());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const body = resolvedPath
    ? t("outputBanner.infoWithPath", { path: resolvedPath })
    : t("outputBanner.infoGeneric", { folderName: DEFAULT_SORT_OUTPUT_FOLDER_LABEL });

  return (
    <div
      role="region"
      className="flex flex-col gap-3 rounded-xl border border-info-bold bg-info-soft p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
    >
      <div className="flex items-start gap-3 min-w-0">
        <svg
          className="w-5 h-5 text-info shrink-0 mt-0.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"
          />
        </svg>
        <p className="text-sm text-info leading-snug min-w-0">{body}</p>
      </div>
      <button
        type="button"
        onClick={onClick}
        className="shrink-0 self-start sm:self-center text-sm font-medium px-3 py-1.5 rounded-lg border border-info-line bg-bg-card text-text-primary hover:bg-hover-overlay transition-colors"
      >
        {t("outputBanner.changeInSettings")}
      </button>
    </div>
  );
}
