import { useEffect, useRef } from "react";
import type { FileEntry, Job } from "../../api";
import type { ReviewRow } from "../../utils/jobView";
import ReviewTable from "../ReviewTable";
import StructureSummaryBanner from "../sort/structure/StructureSummaryBanner";
import { useI18n } from "../../i18n/I18nContext";
import { formatIntegerApostropheThousands } from "../../utils/format";
import { SECONDARY_BTN_CLASS } from "../../utils/styles";
import { downloadJobPlanCsv } from "../../utils/exportJobPlan";
import { trackReviewOpened, trackReviewDismissed } from "../../telemetry/reviewTelemetry";
interface QueueReviewApprovalPanelProps {
  currentJob: Job;
  reviewRows: ReviewRow[];
  isAwaitingApproval: boolean;
  telemetryOptIn: boolean;
  uiLocale: string;
  onUpdateReviewRow: (path: string, patch: Partial<FileEntry>) => void;
  onApproveAll: () => void;
  onRejectAll: () => void;
  onApplyApproved: () => Promise<void>;
}

/**
 * Awaiting-approval header, CSV export, and {@link ReviewTable} for the review workflow.
 */
export function QueueReviewApprovalPanel({
  currentJob,
  reviewRows,
  isAwaitingApproval,
  telemetryOptIn,
  uiLocale,
  onUpdateReviewRow,
  onApproveAll,
  onRejectAll,
  onApplyApproved,
}: QueueReviewApprovalPanelProps) {
  const { t } = useI18n();
  const skipDismissRef = useRef(false);

  useEffect(() => {
    if (!isAwaitingApproval || reviewRows.length === 0) return;
    skipDismissRef.current = false;
    trackReviewOpened(telemetryOptIn, uiLocale, currentJob.id, reviewRows.length);
    return () => {
      if (!skipDismissRef.current) {
        trackReviewDismissed(telemetryOptIn, uiLocale, reviewRows.length);
      }
    };
  }, [isAwaitingApproval, reviewRows.length, telemetryOptIn, uiLocale, currentJob.id]);

  const handleApplyApproved = async () => {
    skipDismissRef.current = true;
    await onApplyApproved();
  };

  if (!isAwaitingApproval) return null;

  return (
    <div className="rounded-xl border border-border bg-bg-card shadow-sm mt-2">
      <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-border-mid bg-bg-secondary/50 border-l-[3px] border-l-warning">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-warning/15 border border-warning-line/40 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-text-primary leading-tight">
              {reviewRows.length === 1
                ? t("queue.needReviewTitleOne")
                : t("queue.needReviewTitle", { count: reviewRows.length })}
            </p>
            <p className="text-xs text-muted truncate">{t("queue.needReviewSubtitle")}</p>
            <p className="text-2xs text-muted mt-1 max-w-md">{t("queue.needReviewHint")}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => downloadJobPlanCsv(currentJob)}
              className={SECONDARY_BTN_CLASS}
            >
              {t("queue.exportCsv")}
            </button>
            <button type="button" onClick={onRejectAll} className={SECONDARY_BTN_CLASS}>
              {t("queue.rejectAll")}
            </button>
            <button
              type="button"
              onClick={onApproveAll}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-warning-bold text-warning hover:bg-warning-soft transition-colors"
            >
              {t("queue.approveAll")}
            </button>
            <button
              type="button"
              onClick={handleApplyApproved}
              className="flex items-center justify-center gap-2 text-xs sm:text-sm font-semibold px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-warning hover:brightness-95 text-bg-primary transition-colors shadow-warning-glow"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              {t("queue.apply")}
            </button>
          </div>
          <p className="text-xs text-muted text-right tabular-nums">
            {t("queue.approvedOf", {
              approved: formatIntegerApostropheThousands(reviewRows.filter((r) => r.approved).length),
              total: formatIntegerApostropheThousands(reviewRows.length),
            })}
          </p>
        </div>
      </div>

      <div className="px-4 pt-3">
        <StructureSummaryBanner job={currentJob} />
      </div>

      <div className="border-t border-border-mid bg-bg-primary/15">
        <ReviewTable
          rows={reviewRows}
          jobId={currentJob?.id ?? null}
          telemetryOptIn={telemetryOptIn}
          uiLocale={uiLocale}
          onToggleApproved={(path, approved) => onUpdateReviewRow(path, { approved })}
          onEditFolder={(path, folder) => onUpdateReviewRow(path, { final_folder: folder })}
        />
      </div>
    </div>
  );
}
