import { useRef, type CSSProperties } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { FileEntry, Job } from "../api";
import { useI18n } from "../i18n/I18nContext";
import { CONFIDENCE_HIGH, CONFIDENCE_LOW } from "../constants";
import { isApplePlatform } from "../utils/platform";
import {
  confidenceLabelI18n,
  folderDisplayLabel,
  formatAnalyzeDurationMs,
} from "../utils/format";
import { shortReviewReasonLabelI18n } from "../utils/formatReviewReason";
import { useProductDebugAccess } from "../hooks/useProductDebugAccess";
import { SortFileDebugDetails } from "./queue/SortFileDebugDetails";
import type { DestinationCountRow } from "../utils/destinationFolderLegendColor";
import {
  DESTINATION_UNCERTAIN_SLICE,
  destinationLegendColorForFolder,
} from "../utils/destinationFolderLegendColor";

const LEGEND_CHIP_BASE =
  "inline-flex max-w-full min-w-0 items-center truncate rounded-md border px-2 py-0.5 text-xs font-semibold";

/** Maps resolved legend colors to readable chips (hex uses translucent fill). */
function destinationLegendChipLook(color: string): { className: string; style?: CSSProperties } {
  if (color === DESTINATION_UNCERTAIN_SLICE) {
    return {
      className: `${LEGEND_CHIP_BASE} uncertain-destination-hatch border-border text-black`,
    };
  }
  if (color.startsWith("#")) {
    return {
      className: LEGEND_CHIP_BASE,
      style: {
        borderColor: color,
        color,
        backgroundColor: `${color}2e`,
      },
    };
  }
  const token =
    {
      "var(--warning)": "border-warning-line text-warning bg-warning-soft",
      "var(--text-muted)": "border-border text-muted bg-surface-subtle",
      "var(--accent)": "border-accent-line text-accent bg-accent-soft",
      "var(--info)": "border-info-line text-info bg-info-soft",
      "var(--error)": "border-error-line text-error bg-error-soft",
    }[color] ?? "border-border text-text-primary bg-bg-secondary";
  return { className: `${LEGEND_CHIP_BASE} ${token}` };
}

function confidenceToneClass(confidence: number): string {
  if (confidence >= CONFIDENCE_HIGH) return "text-success border-success-bold bg-success-soft";
  if (confidence >= CONFIDENCE_LOW) return "text-warning border-warning-bold bg-warning-soft";
  return "text-error border-error-bold bg-error-soft";
}

function statusLine(
  f: FileEntry,
  t: (key: string, vars?: Record<string, string | number>) => string
): string | null {
  switch (f.status) {
    case "pending":
      return t("queue.sortPlanStatusPending");
    case "reading":
      return t("queue.sortPlanStatusReading");
    case "classifying":
      return t("queue.sortPlanStatusClassifying");
    case "applying":
      return t("queue.sortPlanStatusApplying");
    case "review_ready":
    case "done":
      return null;
    case "error":
      return null;
    default:
      return null;
  }
}

function SortPlanRow({
  f,
  t,
  destinationLegendRows,
  showProductDebug,
}: {
  f: FileEntry;
  t: (key: string, vars?: Record<string, string | number>) => string;
  destinationLegendRows?: { display: DestinationCountRow[]; full: DestinationCountRow[] };
  showProductDebug: boolean;
}) {
  const folderRaw = (f.final_folder ?? f.suggested_folder)?.trim() || "";
  const folder = folderRaw ? folderDisplayLabel(folderRaw, t) : "";
  const legendColor =
    destinationLegendRows && folderRaw
      ? destinationLegendColorForFolder(folderRaw, destinationLegendRows.display, destinationLegendRows.full)
      : null;
  const destinationChip = legendColor ? destinationLegendChipLook(legendColor) : null;
  const label = confidenceLabelI18n(f.confidence ?? 0, t);
  const progress = statusLine(f, t);

  if (f.status === "error") {
    const ad = formatAnalyzeDurationMs(f.analyze_duration_ms);
    return (
      <div className="px-4 py-3 space-y-1">
        <p className="text-sm font-semibold text-text-primary break-words">{f.name}</p>
        <p className="text-sm text-error">
          {f.error?.trim() || t("queue.sortPlanErrorGeneric")}
        </p>
        {ad ? (
          <p className="text-2xs text-muted tabular-nums">
            {t("queue.sortPlanAnalyzeAttempt")} {ad}
          </p>
        ) : null}
        {showProductDebug ? <SortFileDebugDetails file={f} /> : null}
      </div>
    );
  }

  const early =
    f.status === "pending" || f.status === "reading" || f.status === "classifying" || f.status === "applying";

  if (early) {
    return (
      <div className="px-4 py-3 space-y-1">
        <p className="text-sm font-semibold text-text-primary break-words">{f.name}</p>
        <p className="text-sm text-muted">{progress}</p>
        {folder ? (
          <p className="text-xs text-text-primary flex flex-wrap items-center gap-1.5 min-w-0">
            <span className="text-muted shrink-0">{t("queue.sortPlanSuggestedFolder")}</span>
            {destinationChip ? (
              <span className={destinationChip.className} style={destinationChip.style}>
                {folder}
              </span>
            ) : (
              <span className="font-medium truncate">{folder}</span>
            )}
          </p>
        ) : null}
      </div>
    );
  }

  const canReveal = f.status === "done" && !!f.dest_path && !!window.electronAPI;
  const revealTitle = canReveal
    ? isApplePlatform()
      ? `Show in Finder: ${f.dest_path}`
      : `Show in Explorer: ${f.dest_path}`
    : undefined;

  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-start justify-between gap-2 min-w-0">
        <p className="text-sm font-semibold text-text-primary break-words flex-1 min-w-0">{f.name}</p>
        {canReveal && (
          <button
            type="button"
            onClick={() => window.electronAPI?.showInFolder(f.dest_path!)}
            title={revealTitle}
            className="shrink-0 p-1 rounded-md text-muted hover:text-accent hover:bg-accent-light transition-colors mt-0.5"
            aria-label={revealTitle}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v8.25m19.5 0v.75A2.25 2.25 0 0 1 19.5 17.25h-15a2.25 2.25 0 0 1-2.25-2.25V13.5" />
            </svg>
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm min-w-0">
        <span className="text-text-primary min-w-0 flex flex-wrap items-center gap-1.5">
          <span className="text-muted shrink-0">{t("queue.sortPlanGoesTo")}</span>
          {destinationChip ? (
            <span className={destinationChip.className} style={destinationChip.style}>
              {folder || "—"}
            </span>
          ) : (
            <span className="font-medium truncate">{folder || "—"}</span>
          )}
        </span>
        <span
          className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border tabular-nums shrink-0 ${confidenceToneClass(
            f.confidence ?? 0
          )}`}
          title={t("queue.sortPlanConfidenceTitle")}
        >
          {label}
          {formatAnalyzeDurationMs(f.analyze_duration_ms) ? (
            <span className="font-normal text-muted">
              · {formatAnalyzeDurationMs(f.analyze_duration_ms)}
            </span>
          ) : null}
        </span>
      </div>
      {f.reason ? (
        <p className="text-xs text-muted leading-snug italic" title={f.reason}>
          {shortReviewReasonLabelI18n(f.reason, t)}
        </p>
      ) : null}
      {f.rule_applied_id ? (
        <p className="text-3xs text-accent">
          {t("queue.sortPlanRuleApplied")} {f.rule_applied_id}
        </p>
      ) : null}
      {showProductDebug ? <SortFileDebugDetails file={f} /> : null}
      {f.dest_path ? (
        canReveal ? (
          <button
            type="button"
            onClick={() => window.electronAPI?.showInFolder(f.dest_path!)}
            title={revealTitle}
            className="flex items-center gap-1.5 w-full min-w-0 text-left group"
          >
            <span className="text-3xs text-muted truncate group-hover:text-accent transition-colors">
              {f.dest_path}
            </span>
          </button>
        ) : (
          <p className="text-3xs text-muted truncate" title={f.dest_path}>
            {f.dest_path}
          </p>
        )
      ) : null}
    </div>
  );
}

interface SortPlanFriendlyProps {
  job: Job;
  variant: "full" | "banner";
  /** Align per-file destination chip colors with the destination folders donut legend. */
  destinationLegendRows?: { display: DestinationCountRow[]; full: DestinationCountRow[] };
}

/**
 * Plain-language sort plan: full scrollable list, or a short banner during review (no duplicate list).
 */
export default function SortPlanFriendly({ job, variant, destinationLegendRows }: SortPlanFriendlyProps) {
  const { t } = useI18n();
  const showProductDebug = useProductDebugAccess();
  const scrollRef = useRef<HTMLDivElement>(null);
  const files = job.files;
  const rowEstimatePx = 88;
  const sortPlanRowVirtualizer = useVirtualizer({
    count: variant === "full" ? files.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowEstimatePx,
    overscan: 10,
  });

  if (variant === "banner") {
    const dry = !!job.config?.dry_run;
    return (
      <div
        role="region"
        aria-label={t("queue.sortPlanAria")}
        className="rounded-xl border border-info-line bg-info-soft/90 px-4 py-3 text-sm text-text-primary"
      >
        <p className="leading-relaxed">
          <strong className="font-semibold text-text-primary">{t("queue.sortPlanBannerBold")}</strong>{" "}
          {dry ? t("queue.sortPlanBannerDry") : t("queue.sortPlanBannerLive")}
        </p>
      </div>
    );
  }

  const dry = !!job.config?.dry_run;
  const n = files.length;
  // Use getTotalSize() directly: measured items use actual heights, unmeasured items use the estimate.
  // Wrapping with Math.max(..., n * rowEstimatePx) inflated the inner div beyond real content,
  // creating an expanding white gap below the last processed row as the estimate exceeds actual heights.
  const listTotalPx = sortPlanRowVirtualizer.getTotalSize();

  return (
    <section
      className="rounded-xl border border-border bg-bg-card overflow-hidden"
      aria-labelledby="sort-plan-friendly-heading"
    >
      <div className="px-4 py-3 border-b border-border bg-bg-secondary/80">
        <h2 id="sort-plan-friendly-heading" className="text-base font-semibold text-text-primary">
          {t("overview.sortedFolders")}
        </h2>
        <p className="text-xs text-muted mt-1 leading-relaxed">
          {n === 1 ? t("queue.sortPlanFilesInJobOne") : t("queue.sortPlanFilesInJob", { count: n })}
          {dry ? t("queue.sortPlanPreviewSuffix") : "."}
        </p>
      </div>
      <div
        ref={scrollRef}
        className="max-h-[min(55vh,28rem)] min-h-[10rem] overflow-y-auto border-t border-border"
      >
        <div className="relative w-full" style={{ height: listTotalPx }}>
          {sortPlanRowVirtualizer.getVirtualItems().map((virtualRow) => {
            const f = files[virtualRow.index];
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={sortPlanRowVirtualizer.measureElement}
                className="absolute left-0 top-0 w-full border-b border-border"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                <SortPlanRow
                  f={f}
                  t={t}
                  destinationLegendRows={destinationLegendRows}
                  showProductDebug={showProductDebug}
                />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
