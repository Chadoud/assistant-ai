import { useI18n } from "../../i18n/I18nContext";
import { Spinner } from "../Spinner";
import { OUTLINE_PILL_BTN_CLASS } from "../../utils/styles";

interface WelcomeLocalServiceCardProps {
  starting: boolean;
  onRetryBackend?: () => void | Promise<void>;
  onSkipSetup: () => void | Promise<void>;
  retryBusy?: boolean;
}

/**
 * Inline recovery when the local Python service is not ready during welcome model steps.
 * Replaces title-bar-only hints — the wizard covers the title bar.
 */
export default function WelcomeLocalServiceCard({
  starting,
  onRetryBackend,
  onSkipSetup,
  retryBusy = false,
}: WelcomeLocalServiceCardProps) {
  const { t } = useI18n();
  const canRetry = typeof onRetryBackend === "function";

  return (
    <div
      className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-4 space-y-3"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        {starting ? (
          <Spinner className="w-5 h-5 shrink-0 mt-0.5 text-amber-200" />
        ) : (
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/30 text-amber-100 text-xs font-bold">
            !
          </span>
        )}
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-amber-100">
            {starting ? t("welcome.localServiceStartingTitle") : t("welcome.localServiceOfflineTitle")}
          </p>
          <p className="text-sm text-amber-200/90 leading-relaxed">
            {starting ? t("welcome.localServiceStartingBody") : t("welcome.localServiceOfflineBody")}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-8">
        {canRetry && (
          <button
            type="button"
            disabled={retryBusy}
            onClick={() => void onRetryBackend!()}
            className={`${OUTLINE_PILL_BTN_CLASS} text-xs py-2 px-4 border-amber-500/50 text-amber-100 hover:bg-amber-500/20 disabled:opacity-60`}
          >
            {retryBusy ? t("welcome.localServiceRetryBusy") : t("welcome.localServiceRetry")}
          </button>
        )}
        <button
          type="button"
          onClick={() => void onSkipSetup()}
          className="text-xs font-medium text-amber-100/90 underline underline-offset-2 hover:text-amber-50"
        >
          {t("welcome.localServiceSkipSetup")}
        </button>
      </div>
    </div>
  );
}
