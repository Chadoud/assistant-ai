import type { Job } from "../../api";
import { useI18n } from "../../i18n/I18nContext";
import { formatIntegerApostropheThousands } from "../../utils/format";
import { KNOWN_JOB_PHASES } from "./queuePanelConstants";
import { pipelineProgressFillStyle } from "./pipelineProgressUtils";
import type { ReactNode } from "react";

export type PrepProgressMode = "off" | "starting" | "sending" | "queued";

interface GmailJobProgressBlockProps {
  showGmailJobProgressCard: boolean;
  currentJob: Job;
  totalCount: number;
  gmailMessagesListEstimate: number | null;
  /** When set, progressive Drive listing has a known row count (even before paths append). */
  driveImportStillFetching?: boolean;
  driveListingDiscovered?: number | null;
  prepProgressMode: PrepProgressMode;
  processedCount: number;
  pipelineCountTotal: number;
  pipelineRemaining: number;
  jobPipelineDisplayPct: number;
  phaseHint: (p: string) => string;
}

/**
 * Phase + “N of M” bar for Gmail import jobs (snapshot area or fallback under the job header).
 */
export function GmailJobProgressBlock({
  showGmailJobProgressCard,
  currentJob,
  totalCount,
  gmailMessagesListEstimate,
  driveImportStillFetching = false,
  driveListingDiscovered = null,
  prepProgressMode,
  processedCount,
  pipelineCountTotal,
  pipelineRemaining,
  jobPipelineDisplayPct,
  phaseHint,
}: GmailJobProgressBlockProps): ReactNode {
  const { t } = useI18n();

  if (!showGmailJobProgressCard) return null;

  const hasKnownPipelineExtent =
    totalCount > 0 ||
    gmailMessagesListEstimate !== null ||
    (driveImportStillFetching && driveListingDiscovered !== null);

  if (hasKnownPipelineExtent) {
    return (
      <>
        <div className="text-xs text-muted min-w-0">
          <span className="text-text-primary font-medium">
            {prepProgressMode === "queued" && processedCount === 0
              ? t("queue.workspacePrepDetailQueued")
              : KNOWN_JOB_PHASES.has(currentJob.phase)
                ? phaseHint(currentJob.phase)
                : t("queue.phaseWorking")}
          </span>
          <span className="text-muted">
            {" "}
            ·{" "}
            {t("queue.processedOf", {
              processed: formatIntegerApostropheThousands(processedCount),
              total: formatIntegerApostropheThousands(pipelineCountTotal),
            })}
          </span>
        </div>
        <div
          className="w-full min-w-0 h-2 rounded-full bg-border overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={pipelineCountTotal}
          aria-valuenow={processedCount}
          aria-valuetext={t("queue.pipelineProgressAria", {
            processed: formatIntegerApostropheThousands(processedCount),
            total: formatIntegerApostropheThousands(pipelineCountTotal),
            remaining: formatIntegerApostropheThousands(pipelineRemaining),
          })}
        >
          <div
            className="h-full w-full origin-left rounded-full bg-accent transition-transform duration-500 ease-out"
            style={pipelineProgressFillStyle(jobPipelineDisplayPct)}
          />
        </div>
      </>
    );
  }

  return (
    <div
      className="relative w-full min-w-0 h-2 rounded-full bg-border overflow-hidden"
      role="progressbar"
      aria-busy="true"
      aria-valuetext={t("queue.workspacePrepIndeterminateAria")}
    >
      <div className="absolute top-0 bottom-0 w-[30%] rounded-full bg-accent animate-prepIndeterminate" />
    </div>
  );
}
