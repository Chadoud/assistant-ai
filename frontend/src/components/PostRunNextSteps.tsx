import { SECONDARY_BTN_CLASS } from "../utils/styles";
import { useI18n } from "../i18n/I18nContext";
import { formatIntegerApostropheThousands } from "../utils/format";
import { track } from "../telemetry/client";
import { jobOutcomeFromCounts } from "../telemetry/buckets";
import { TelemetryEventNames } from "../telemetry/schema";

type PostRunCtaDestination = "overview" | "history" | "dropzone";

interface PostRunNextStepsProps {
  totalCount: number;
  sortedCount: number;
  failedSortCount: number;
  failedFetchCount: number;
  uncertainCount: number;
  telemetryOptIn: boolean;
  uiLocale: string;
  onGoToOverview: () => void;
  onGoToHistory: () => void;
  onFocusDropZone: () => void;
  /** Permanent dismiss — parent writes `POST_RUN_CARD_DISMISSED_KEY`. */
  onDismiss: () => void;
  /** Called after any CTA so parent can hide the card for this job this session. */
  onAfterCta?: () => void;
}

/** Shown after a job finishes — summary counts + clear next actions. */
export default function PostRunNextSteps({
  totalCount,
  sortedCount,
  failedSortCount,
  failedFetchCount,
  uncertainCount,
  telemetryOptIn,
  uiLocale,
  onGoToOverview,
  onGoToHistory,
  onFocusDropZone,
  onDismiss,
  onAfterCta,
}: PostRunNextStepsProps) {
  const { t } = useI18n();

  const postRunOutcome = jobOutcomeFromCounts({
    uncertainCount,
    failedSortCount,
    failedFetchCount,
  });

  const fireCta = (destination: PostRunCtaDestination, action: () => void) => {
    track(telemetryOptIn, uiLocale, TelemetryEventNames.postRunCtaClicked, {
      destination,
      outcome: postRunOutcome,
      ui_locale: uiLocale,
    });
    onAfterCta?.();
    action();
  };

  return (
    <div
      className="rounded-xl border border-success-line/50 bg-success-faint/40 px-4 py-4 shadow-sm"
      role="region"
      aria-label={t("queue.postRunAria")}
    >
      <p className="text-sm font-semibold text-text-primary">{t("queue.postRunTitle")}</p>
      <p className="text-xs text-muted mt-1 leading-relaxed">
        {t("queue.postRunSummary", {
          total: formatIntegerApostropheThousands(totalCount),
          sorted: formatIntegerApostropheThousands(sortedCount),
          failedSort: formatIntegerApostropheThousands(failedSortCount),
          failedFetch: formatIntegerApostropheThousands(failedFetchCount),
          uncertain: formatIntegerApostropheThousands(uncertainCount),
        })}
      </p>
      <p className="text-2xs text-muted mt-2">{t("queue.postRunHint")}</p>
      <div className="flex flex-wrap gap-2 mt-4">
        <button
          type="button"
          onClick={() => fireCta("overview", onGoToOverview)}
          className={SECONDARY_BTN_CLASS}
        >
          {t("queue.postRunCtaOverview")}
        </button>
        <button
          type="button"
          onClick={() => fireCta("history", onGoToHistory)}
          className={SECONDARY_BTN_CLASS}
        >
          {t("queue.postRunCtaHistory")}
        </button>
        <button
          type="button"
          onClick={() => fireCta("dropzone", onFocusDropZone)}
          className={SECONDARY_BTN_CLASS}
        >
          {t("queue.postRunCtaMoreFiles")}
        </button>
        <button type="button" onClick={onDismiss} className={`${SECONDARY_BTN_CLASS} text-muted`}>
          {t("queue.postRunDismiss")}
        </button>
      </div>
    </div>
  );
}
