import type { FileEntry } from "../api";
import { CONFIDENCE_HIGH, CONFIDENCE_LOW } from "../constants";
import { useI18n } from "../i18n/I18nContext";
import { confidenceLabelI18n, folderDisplayLabel, formatAnalyzeDurationMs } from "../utils/format";
import { shortReviewReasonLabel } from "../utils/formatReviewReason";

const STATUS_CONFIG = {
  pending:      { label: "Pending",      dot: "bg-muted",                          bar: "bg-border",       badge: "bg-surface-subtle text-muted" },
  reading:      { label: "Reading",      dot: "bg-info animate-pulse",             bar: "bg-info",         badge: "bg-info-soft text-info" },
  classifying:  { label: "Classifying",  dot: "bg-warning animate-pulse",          bar: "bg-warning",      badge: "bg-warning-soft text-warning" },
  review_ready: { label: "Review",       dot: "bg-info",                           bar: "bg-info",         badge: "bg-info-soft text-info" },
  applying:     { label: "Applying",     dot: "bg-accent animate-pulse",           bar: "bg-accent",       badge: "bg-accent-soft text-accent" },
  done:         { label: "Sorted",       dot: "bg-success",                        bar: "bg-success",      badge: "bg-success-soft text-success" },
  error:        { label: "Error",        dot: "bg-error",                          bar: "bg-error",        badge: "bg-error-soft text-error" },
};

const FILE_ICONS: Record<string, string> = {
  pdf: "📄", docx: "📝", doc: "📝", xlsx: "📊", xls: "📊",
  csv: "📊", txt: "📃", md: "📃", jpg: "🖼️", jpeg: "🖼️",
  png: "🖼️", gif: "🖼️", webp: "🖼️", py: "🐍", js: "📜",
  ts: "📜", html: "🌐", json: "⚙️", zip: "🗜️",
};

function getIcon(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return FILE_ICONS[ext] ?? "📁";
}

interface FileCardProps {
  file: FileEntry;
  onUndo?: (entryId: string) => void;
  onReassign?: () => void;
}

export default function FileCard({ file, onUndo, onReassign }: FileCardProps) {
  const { t } = useI18n();
  const config = STATUS_CONFIG[file.status] ?? STATUS_CONFIG.pending;
  const canReveal = file.status === "done" && !!file.dest_path;
  const isActive = ["reading", "classifying", "applying"].includes(file.status);

  function revealInFolder() {
    if (canReveal) window.electronAPI?.showInFolder(file.dest_path!);
  }

  return (
    <div className={`
      flex items-center gap-3 pl-0 pr-3 py-0 rounded-xl border border-border
      bg-bg-card transition-all duration-300 overflow-hidden
      ${file.status === "done" ? "hover:border-accent-line-strong" : ""}
    `}>
      {/* Colored left accent bar */}
      <div className={`w-1 self-stretch shrink-0 rounded-l-xl ${config.bar} ${isActive ? "animate-pulse" : ""}`} />

      {/* File icon */}
      <div className="text-xl w-7 text-center shrink-0 select-none py-3">
        {getIcon(file.name)}
      </div>

      {/* File info */}
      <div className="flex-1 min-w-0 py-3">
        <p
          className={`text-sm font-medium text-text-primary truncate leading-tight
            ${canReveal ? "cursor-pointer hover:text-accent" : ""}`}
          title={canReveal ? `Click to reveal: ${file.dest_path}` : file.name}
          onClick={revealInFolder}
        >
          {file.name}
        </p>

        {(file.final_folder || file.suggested_folder) && (
          <p
            className={`text-xs truncate mt-0.5 flex items-center gap-1 ${canReveal ? "cursor-pointer" : ""}`}
            onClick={revealInFolder}
          >
            <span className="text-muted shrink-0">→</span>
            <span
              className={`truncate ${canReveal ? "text-accent hover:underline" : "text-accent"}`}
              title={file.final_folder ?? file.suggested_folder ?? undefined}
            >
              {folderDisplayLabel(String(file.final_folder ?? file.suggested_folder ?? ""), t)}
            </span>
          </p>
        )}

        {/* Confidence + reason — shown once the AI has classified */}
        {(file.status === "done" || file.status === "review_ready") &&
          file.confidence != null && file.confidence > 0 && (
          <div className="mt-1 flex items-center gap-2 flex-wrap" title={t("queue.fileCardConfidenceTitle")}>
            <span
              className={`text-2xs font-semibold px-1.5 py-0.5 rounded-full border shrink-0 ${
                file.confidence >= CONFIDENCE_HIGH
                  ? "text-success border-success-bold bg-success-soft"
                  : file.confidence >= CONFIDENCE_LOW
                    ? "text-warning border-warning-bold bg-warning-soft"
                    : "text-error border-error-bold bg-error-soft"
              }`}
            >
              {confidenceLabelI18n(file.confidence, t)}
            </span>
            {file.reason && (
              <span className="text-2xs text-muted truncate italic" title={file.reason}>
                {shortReviewReasonLabel(file.reason)}
              </span>
            )}
          </div>
        )}

        {file.error && (
          <p className="text-xs text-error truncate mt-0.5" title={file.error}>
            {file.error}
          </p>
        )}
        {(file.status === "review_ready" || file.status === "done" || file.status === "error") &&
          formatAnalyzeDurationMs(file.analyze_duration_ms) && (
            <p className="text-2xs text-muted tabular-nums mt-0.5" title={t("queue.fileCardAnalyzeHint")}>
              Analyze: {formatAnalyzeDurationMs(file.analyze_duration_ms)}
            </p>
          )}
      </div>

      {/* Status badge */}
      <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full shrink-0 ${config.badge}`}>
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${config.dot}`} />
        <span className="text-xs font-medium">{config.label}</span>
      </div>

      {/* Action buttons — done files only */}
      {file.status === "done" && file.entry_id && (
        <div className="flex items-center gap-1 shrink-0">
          {onReassign && (
            <button
              onClick={onReassign}
              className="p-1.5 rounded-lg text-muted hover:text-accent hover:bg-accent-light transition-colors"
              title="Move to a different folder"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v8.25m19.5 0v.75A2.25 2.25 0 0 1 19.5 17.25h-15a2.25 2.25 0 0 1-2.25-2.25V13.5" />
              </svg>
            </button>
          )}
          {onUndo && (
            <button
              onClick={() => onUndo(file.entry_id!)}
              className="p-1.5 rounded-lg text-muted hover:text-error hover:bg-error-soft transition-colors"
              title="Undo this file"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
