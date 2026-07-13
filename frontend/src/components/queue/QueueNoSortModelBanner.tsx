import { useI18n } from "../../i18n/I18nContext";

type QueueNoSortModelBannerProps = {
  onOpenSortModelDownload: () => void;
};

/** Warning when no sort model is configured — opens the model download modal. */
export function QueueNoSortModelBanner({ onOpenSortModelDownload }: QueueNoSortModelBannerProps) {
  const { t } = useI18n();

  return (
    <button
      type="button"
      onClick={onOpenSortModelDownload}
      aria-label={`${t("queue.noSortModelAria")}: ${t("queue.noSortModelBanner")}`}
      className="w-full text-left flex flex-col gap-3 rounded-xl border border-warning-line bg-warning-soft p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 hover:bg-warning-soft/80 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-warning focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
    >
      <div className="flex items-start gap-3 min-w-0">
        <svg
          className="w-5 h-5 text-warning shrink-0 mt-0.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
          />
        </svg>
        <p className="text-sm text-warning leading-snug min-w-0">{t("queue.noSortModelBanner")}</p>
      </div>
      <span className="shrink-0 self-start sm:self-center text-sm font-medium px-3 py-1.5 rounded-lg border border-warning-line bg-bg-card text-text-primary sm:ml-2">
        {t("queue.noSortModelCta")}
      </span>
    </button>
  );
}
