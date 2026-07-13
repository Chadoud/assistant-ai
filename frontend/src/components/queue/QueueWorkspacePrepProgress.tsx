import { Spinner } from "../Spinner";
import { formatIntegerApostropheThousands } from "../../utils/format";
import { SECONDARY_BTN_CLASS } from "../../utils/styles";
import { pipelineProgressFillStyle } from "./pipelineProgressUtils";

type PrepProgressMode = "off" | "starting" | "sending" | "queued";

type QueueWorkspacePrepProgressProps = {
  mode: PrepProgressMode;
  workspaceBatchStarting: boolean;
  workspacePrepGmailInBatch: boolean;
  prepStallHint: boolean;
  prepStallTranslationKey: string;
  prepCanShowJobPipelinePct: boolean;
  pipelineCountTotal: number;
  processedCount: number;
  pipelineRemaining: number;
  jobPipelineDisplayPct: number;
  onCancelWorkspaceBatchStart: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  /** Compact layout for web-only prep card. */
  variant?: "inline" | "card";
};

/** Workspace batch / send prep feedback — determinate when pipeline counts exist, else indeterminate. */
export function QueueWorkspacePrepProgress({
  mode,
  workspaceBatchStarting,
  workspacePrepGmailInBatch,
  prepStallHint,
  prepStallTranslationKey,
  prepCanShowJobPipelinePct,
  pipelineCountTotal,
  processedCount,
  pipelineRemaining,
  jobPipelineDisplayPct,
  onCancelWorkspaceBatchStart,
  t,
  variant = "inline",
}: QueueWorkspacePrepProgressProps) {
  if (mode !== "starting" && mode !== "sending") return null;

  const detailClass =
    variant === "card" ? "text-muted/85 leading-snug" : "text-2xs text-muted/85 leading-snug";

  const progressBar = prepCanShowJobPipelinePct ? (
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
        className="h-full w-full origin-left rounded-full bg-accent transition-transform duration-300 ease-out"
        style={pipelineProgressFillStyle(jobPipelineDisplayPct)}
      />
    </div>
  ) : (
    <div
      className="relative w-full min-w-0 h-2 rounded-full bg-border overflow-hidden"
      role="progressbar"
      aria-busy="true"
      aria-valuetext={t("queue.workspacePrepIndeterminateAria")}
    >
      <div className="absolute top-0 bottom-0 w-[30%] rounded-full bg-accent animate-prepIndeterminate" />
    </div>
  );

  const cancelButton = workspaceBatchStarting ? (
    <button
      type="button"
      onClick={onCancelWorkspaceBatchStart}
      className={`${SECONDARY_BTN_CLASS} px-4 text-sm shrink-0`}
    >
      {t("queue.workspaceRunBatchCancel")}
    </button>
  ) : null;

  if (variant === "card") {
    return (
      <div className="w-full max-w-xs space-y-2">
        <div className="text-2xs text-muted min-w-0 text-left">
          <div className="space-y-1">
            <p className="font-medium text-text-primary">
              {mode === "starting"
                ? t("queue.workspacePrepDetailStarting")
                : t("queue.workspacePrepDetailSending")}
            </p>
            {mode === "starting" && workspacePrepGmailInBatch ? (
              <p className={detailClass}>{t("queue.workspacePrepGmailExportHint")}</p>
            ) : null}
            {prepStallHint ? <p className={detailClass}>{t(prepStallTranslationKey)}</p> : null}
          </div>
        </div>
        {progressBar}
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-2 pt-1" role="status" aria-label={t("queue.workspacePrepBarAria")}>
      <div className="text-xs text-muted min-w-0">
        <div className="space-y-1">
          <p className="font-medium text-text-primary">
            {mode === "starting"
              ? t("queue.workspacePrepDetailStarting")
              : t("queue.workspacePrepDetailSending")}
          </p>
          {mode === "starting" && workspacePrepGmailInBatch ? (
            <p className={detailClass}>{t("queue.workspacePrepGmailExportHint")}</p>
          ) : null}
          {prepStallHint ? <p className={detailClass}>{t(prepStallTranslationKey)}</p> : null}
        </div>
      </div>
      {progressBar}
      {cancelButton ? <div className="flex justify-center">{cancelButton}</div> : null}
    </div>
  );
}

type QueueSendingHintProps = {
  previewCount: number | null;
  t: (key: string, params?: Record<string, string | number>) => string;
  className?: string;
};

/** “Sending to AI…” line shown while enqueue is in flight before a job exists. */
export function QueueSendingHint({ previewCount, t, className }: QueueSendingHintProps) {
  if (previewCount === null) return null;
  return (
    <div className={className ?? "flex items-center gap-2 justify-center text-xs text-muted"}>
      <Spinner className="w-3.5 h-3.5 text-accent" aria-hidden />
      <span>
        {previewCount === 1 ? t("queue.sendingAiOne") : t("queue.sendingAi", { count: previewCount })}
      </span>
    </div>
  );
}
