import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { FileEntry } from "../api";
import { CONFIDENCE_HIGH, CONFIDENCE_LOW, reviewFiltersStorageKey } from "../constants";
import { useI18n } from "../i18n/I18nContext";
import { track } from "../telemetry/client";
import { TelemetryEventNames } from "../telemetry/schema";
import { confidenceLabelI18n, formatAnalyzeDurationMs } from "../utils/format";
import { shortReviewReasonLabel } from "../utils/formatReviewReason";
import {
  filterReviewRows,
  type ApprovalFilter,
  type ConfidenceFilter,
} from "./reviewTableFilters";
import SelectDropdown, {
  SELECT_DROPDOWN_PANEL_CLASS,
  selectDropdownPlainOptionClassName,
} from "./ui/SelectDropdown";

const PREVIEW_CARD_W = 288;
const PREVIEW_HOVER_CLOSE_MS = 220;

const PREVIEW_IMAGE_EXT = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "bmp",
  "avif",
]);

function openFilePath(path: string) {
  void window.electronAPI?.openPath(path);
}

function isPreviewableImagePath(filePath: string): boolean {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return PREVIEW_IMAGE_EXT.has(ext);
}

/** Hover preview: image (Electron) + extracted text + path in a fixed card (portal avoids overflow clipping). */
function ReviewFilePreviewTrigger({ row }: { row: FileEntry }) {
  const { t } = useI18n();
  const btnRef = useRef<HTMLButtonElement>(null);
  /** Portal root — used to ignore scroll/focus events that originate inside the preview card. */
  const panelSurfaceRef = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [panel, setPanel] = useState<{
    top: number;
    left: number;
    /** When opening above the eye button, anchor bottom to the trigger (fixed height guess no longer needed). */
    transform?: string;
    /** Tighter max-height when flipped above so content stays in the viewport. */
    maxHeightPx?: number;
  } | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageStatus, setImageStatus] = useState<"idle" | "loading" | "ready" | "skip" | "too_large" | "error">(
    "idle"
  );

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setPanel(null), PREVIEW_HOVER_CLOSE_MS);
  }, [cancelClose]);

  useEffect(() => () => cancelClose(), [cancelClose]);

  const placePanel = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 6;
    let left = r.left;
    if (left + PREVIEW_CARD_W > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - PREVIEW_CARD_W - 12);
    }
    const estH = Math.min(window.innerHeight * 0.72, 420);
    const topBelow = r.bottom + gap;
    const wouldOverflowBelow = topBelow + estH > window.innerHeight - 12;
    if (!wouldOverflowBelow) {
      setPanel({ top: topBelow, left, transform: undefined, maxHeightPx: undefined });
      return;
    }
    /* Open above the button: pin `top` to the trigger’s top edge minus gap, then pull the card up by its own height. */
    const spaceAbove = Math.floor(r.top - gap - 12);
    const maxHAbove = Math.max(160, Math.min(spaceAbove, estH));
    setPanel({
      top: r.top - gap,
      left,
      transform: "translateY(-100%)",
      maxHeightPx: maxHAbove,
    });
  }, []);

  useEffect(() => {
    if (!panel) {
      setImageDataUrl(null);
      setImageStatus("idle");
      return;
    }
    const api = window.electronAPI?.getPreviewImageDataUrl;
    if (!api || !isPreviewableImagePath(row.path)) {
      setImageDataUrl(null);
      setImageStatus("skip");
      return;
    }
    setImageStatus("loading");
    setImageDataUrl(null);
    let cancelled = false;
    void api(row.path).then((res) => {
      if (cancelled) return;
      if (res && "dataUrl" in res && typeof res.dataUrl === "string") {
        setImageDataUrl(res.dataUrl);
        setImageStatus("ready");
      } else if (res && "error" in res && res.error === "too_large") {
        setImageStatus("too_large");
      } else {
        setImageStatus("error");
      }
    }).catch(() => {
      if (!cancelled) setImageStatus("error");
    });
    return () => {
      cancelled = true;
    };
  }, [panel, row.path]);

  useEffect(() => {
    if (!panel) return;
    /* Capture-phase listener sees every scroll, including non-bubbling scroll on overflow children.
       Only close when the element that scrolled is NOT inside the preview card (e.g. main list scroll). */
    const onScroll = (e: Event) => {
      const t = e.target;
      if (t instanceof Node && panelSurfaceRef.current?.contains(t)) return;
      setPanel(null);
    };
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [panel]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        title={t("queue.reviewPreviewTitle")}
        aria-haspopup="true"
        aria-expanded={!!panel}
        className="w-7 h-7 rounded-lg flex items-center justify-center transition-all text-muted hover:text-accent hover:bg-accent-light border border-border"
        onMouseEnter={() => {
          cancelClose();
          placePanel();
        }}
        onMouseLeave={scheduleClose}
        onFocus={() => {
          cancelClose();
          placePanel();
        }}
        onBlur={(e) => {
          const next = e.relatedTarget;
          if (next instanceof Node && panelSurfaceRef.current?.contains(next)) return;
          scheduleClose();
        }}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.01 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>
      </button>

      {panel &&
        createPortal(
          <div
            ref={panelSurfaceRef}
            role="region"
            aria-label={`Preview for ${row.name}`}
            className="fixed z-[200] w-[min(22rem,calc(100vw-1.5rem))] max-w-[22rem] rounded-xl border border-border bg-bg-card shadow-xl shadow-black/15 dark:shadow-black/40 p-3 text-left pointer-events-auto flex flex-col gap-2"
            style={{
              top: panel.top,
              left: panel.left,
              maxHeight:
                panel.maxHeightPx != null ? `${panel.maxHeightPx}px` : "min(72vh,26rem)",
              transform: panel.transform,
            }}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
          >
            <p className="text-2xs font-semibold text-text-primary truncate" title={row.name}>
              {row.name}
            </p>
            <p className="text-3xs text-muted truncate font-mono shrink-0" title={row.path}>
              {row.path}
            </p>
            {imageStatus === "loading" ? (
              <p className="text-3xs text-muted">{t("queue.reviewPreviewImageLoading")}</p>
            ) : null}
            {imageStatus === "too_large" || imageStatus === "error" ? (
              <p className="text-3xs text-warning">
                {imageStatus === "too_large"
                  ? t("queue.reviewPreviewImageTooLarge")
                  : t("queue.reviewPreviewImageError")}
              </p>
            ) : null}
            {imageStatus === "ready" && imageDataUrl ? (
              <div className="rounded-lg overflow-hidden border border-border-soft bg-surface-subtle flex items-center justify-center min-h-[6rem] max-h-[11rem] shrink-0">
                <img
                  src={imageDataUrl}
                  alt={row.name}
                  className="max-h-[11rem] w-full object-contain"
                />
              </div>
            ) : null}
            <div className="pt-1 border-t border-border-soft shrink min-h-0 flex flex-col gap-1">
              <p className="text-3xs font-semibold uppercase tracking-wide text-muted">
                {t("queue.reviewPreviewExtractedHeading")}
              </p>
              <div className="max-h-[min(36vh,12rem)] overflow-y-auto text-3xs text-muted leading-relaxed whitespace-pre-wrap">
                {row.analysis_excerpt?.trim()
                  ? row.analysis_excerpt
                  : t("queue.reviewPreviewNoText")}
              </div>
            </div>
            <p className="text-3xs text-muted italic shrink-0">{t("queue.reviewPreviewFooter")}</p>
          </div>,
          document.body
        )}
    </>
  );
}

interface ReviewTableProps {
  rows: FileEntry[];
  onToggleApproved: (path: string, approved: boolean) => void;
  onEditFolder: (path: string, folder: string) => void;
  jobId: string | null;
  telemetryOptIn: boolean;
  uiLocale: string;
}

function confidenceBadge(confidence: number) {
  if (confidence >= CONFIDENCE_HIGH) return "text-success border-success-bold bg-success-soft";
  if (confidence >= CONFIDENCE_LOW) return "text-warning border-warning-bold bg-warning-soft";
  return "text-error border-error-bold bg-error-soft";
}

/** Matches Tailwind `sm` (640px) and `xl` (1280px) for the review card grid. */
function useReviewGridColumnCount(): number {
  const [n, setN] = useState(1);
  useEffect(() => {
    const mqXl = window.matchMedia("(min-width: 1280px)");
    const mqSm = window.matchMedia("(min-width: 640px)");
    const sync = () => {
      if (mqXl.matches) setN(3);
      else if (mqSm.matches) setN(2);
      else setN(1);
    };
    sync();
    mqXl.addEventListener("change", sync);
    mqSm.addEventListener("change", sync);
    return () => {
      mqXl.removeEventListener("change", sync);
      mqSm.removeEventListener("change", sync);
    };
  }, []);
  return n;
}

function ReviewTableCard({
  r,
  onToggleApproved,
  onEditFolder,
}: {
  r: FileEntry;
  onToggleApproved: (path: string, approved: boolean) => void;
  onEditFolder: (path: string, folder: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div
      role="listitem"
      className={`
            rounded-xl border transition-colors min-w-0 flex flex-col gap-2 p-2.5
            ${r.approved
              ? "border-border bg-bg-card shadow-sm"
              : "border-error-line/50 bg-error-faint/80 opacity-90"}
          `}
    >
      <div className="flex gap-2 items-start min-w-0">
        <div className="min-w-0 flex-1 space-y-0.5">
          <button
            type="button"
            title={window.electronAPI ? `Open ${r.name}` : r.name}
            className="text-xs font-medium text-text-primary break-words line-clamp-2 text-left w-full hover:text-accent hover:underline cursor-pointer"
            onClick={() => openFilePath(r.path)}
          >
            {r.name}
          </button>
          {r.reason && (
            <p className="text-3xs text-muted line-clamp-2 italic" title={r.reason}>
              {shortReviewReasonLabel(r.reason)}
            </p>
          )}
          {r.primary_purpose ? (
            <p className="text-3xs text-muted/90 line-clamp-2" title={r.primary_purpose}>
              {t("queue.reviewPrimaryPurpose")}: {r.primary_purpose}
            </p>
          ) : null}
          {r.rule_applied_id && (
            <p className="text-3xs text-accent truncate" title={`Rule ${r.rule_applied_id}`}>
              Rule: {r.rule_applied_id}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-1 shrink-0 self-start pt-0.5 [&_button]:w-7 [&_button]:h-7">
          <button
            type="button"
            onClick={() => onToggleApproved(r.path, true)}
            title="Approve"
            className={`rounded-lg flex items-center justify-center transition-all
                  ${r.approved
                    ? "bg-success-strong text-success border border-success-bold"
                    : "text-muted hover:text-success hover:bg-success-soft border border-border"}`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onToggleApproved(r.path, false)}
            title="Reject"
            className={`rounded-lg flex items-center justify-center transition-all
                  ${!r.approved
                    ? "bg-error-strong text-error border border-error-bold"
                    : "text-muted hover:text-error hover:bg-error-soft border border-border"}`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
          <ReviewFilePreviewTrigger row={r} />
          {window.electronAPI ? (
            <button
              type="button"
              title={t("queue.reviewRevealInFolder")}
              className="rounded-lg flex items-center justify-center transition-all text-muted hover:text-accent hover:bg-accent-light border border-border"
              onClick={() => void window.electronAPI?.showInFolder(r.path)}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v8.25m19.5 0v.75A2.25 2.25 0 0 1 19.5 17.25h-15a2.25 2.25 0 0 1-2.25-2.25V13.5" />
              </svg>
            </button>
          ) : (
            <span className="w-7 h-7 shrink-0 block rounded-lg" aria-hidden />
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5 min-w-0 sm:flex-row sm:items-center sm:flex-wrap">
        <span
          className={`inline-flex items-center w-fit max-w-full text-3xs font-semibold px-1.5 py-0.5 rounded-full border tabular-nums shrink-0
                ${confidenceBadge(r.confidence ?? 0)}`}
          title={t("queue.fileCardConfidenceTitle")}
        >
          <span className="truncate">
            {confidenceLabelI18n(r.confidence ?? 0, t)}
          </span>
          {formatAnalyzeDurationMs(r.analyze_duration_ms) ? (
            <span className="font-normal text-muted ml-1 shrink-0">· {formatAnalyzeDurationMs(r.analyze_duration_ms)}</span>
          ) : null}
        </span>

        <input
          value={r.final_folder ?? ""}
          onChange={(e) => onEditFolder(r.path, e.target.value)}
          placeholder={r.suggested_folder ?? "Folder name"}
          aria-label={`Destination folder for ${r.name}`}
          className="w-full min-w-0 flex-1 rounded-lg border border-border bg-bg-secondary px-2 py-1 text-xs text-text-primary placeholder:text-muted/80 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/25 transition-colors"
        />
      </div>
    </div>
  );
}

export default function ReviewTable({
  rows,
  onToggleApproved,
  onEditFolder,
  jobId,
  telemetryOptIn,
  uiLocale,
}: ReviewTableProps) {
  const { t } = useI18n();
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>("all");
  const [approvalFilter, setApprovalFilter] = useState<ApprovalFilter>("all");
  const [confidenceMenuOpen, setConfidenceMenuOpen] = useState(false);
  const [approvalMenuOpen, setApprovalMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filtersReady, setFiltersReady] = useState(false);

  useEffect(() => {
    if (!jobId) {
      setConfidenceFilter("all");
      setApprovalFilter("all");
      setSearchQuery("");
      setFiltersReady(true);
      return;
    }
    setFiltersReady(false);
    try {
      const raw = sessionStorage.getItem(reviewFiltersStorageKey(jobId));
      if (raw) {
        const p = JSON.parse(raw) as Partial<{ c: ConfidenceFilter; a: ApprovalFilter; s: string }>;
        if (p.c === "all" || p.c === "high" || p.c === "medium" || p.c === "low") {
          setConfidenceFilter(p.c);
        } else {
          setConfidenceFilter("all");
        }
        if (p.a === "all" || p.a === "needsReview" || p.a === "approved") {
          setApprovalFilter(p.a);
        } else {
          setApprovalFilter("all");
        }
        setSearchQuery(typeof p.s === "string" ? p.s : "");
      } else {
        setConfidenceFilter("all");
        setApprovalFilter("all");
        setSearchQuery("");
      }
    } catch {
      setConfidenceFilter("all");
      setApprovalFilter("all");
      setSearchQuery("");
    }
    setFiltersReady(true);
  }, [jobId]);

  useEffect(() => {
    if (!jobId || !filtersReady) return;
    try {
      sessionStorage.setItem(
        reviewFiltersStorageKey(jobId),
        JSON.stringify({ c: confidenceFilter, a: approvalFilter, s: searchQuery })
      );
    } catch {
      /* ignore */
    }
  }, [jobId, filtersReady, confidenceFilter, approvalFilter, searchQuery]);

  const trackFilter = useCallback(
    (filterField: "confidence" | "approval" | "search", selection: string) => {
      track(telemetryOptIn, uiLocale, TelemetryEventNames.reviewFilterChanged, {
        filter_field: filterField,
        selection,
        ui_locale: uiLocale,
      });
    },
    [telemetryOptIn, uiLocale]
  );

  const filteredRows = useMemo(
    () =>
      filterReviewRows(rows, {
        confidence: confidenceFilter,
        approval: approvalFilter,
        searchQuery,
      }),
    [rows, confidenceFilter, approvalFilter, searchQuery],
  );

  const columnCount = useReviewGridColumnCount();
  const reviewScrollRef = useRef<HTMLDivElement>(null);
  const reviewGridRowCount =
    filteredRows.length === 0 ? 0 : Math.ceil(filteredRows.length / columnCount);
  const reviewVirtualizer = useVirtualizer({
    count: reviewGridRowCount,
    getScrollElement: () => reviewScrollRef.current,
    estimateSize: () => 200,
    overscan: 2,
  });

  const confidenceTriggerLabel = useMemo(() => {
    switch (confidenceFilter) {
      case "all":
        return t("queue.reviewFilterConfidenceAll");
      case "high":
        return t("queue.reviewFilterConfidenceHigh");
      case "medium":
        return t("queue.reviewFilterConfidenceMedium");
      case "low":
        return t("queue.reviewFilterConfidenceLow");
      default:
        return t("queue.reviewFilterConfidenceAll");
    }
  }, [confidenceFilter, t]);

  const approvalTriggerLabel = useMemo(() => {
    switch (approvalFilter) {
      case "all":
        return t("queue.reviewFilterApprovalAll");
      case "needsReview":
        return t("queue.reviewFilterApprovalNeedsReview");
      case "approved":
        return t("queue.reviewFilterApprovalApproved");
      default:
        return t("queue.reviewFilterApprovalAll");
    }
  }, [approvalFilter, t]);

  const filterDropdownTriggerClass =
    "!py-1.5 !px-2 !text-2xs !gap-1.5 min-w-0 w-full max-w-[11rem]";
  /** Approval labels are longer in several locales; avoid clipping the open list to the confidence column width. */
  const approvalFilterTriggerClass =
    "!py-1.5 !px-2 !text-2xs !gap-1.5 w-full min-w-[12rem] sm:min-w-[14rem] max-w-[20rem]";
  const approvalFilterPanelClass = `${SELECT_DROPDOWN_PANEL_CLASS} !min-w-[14rem] sm:!min-w-[16rem] max-w-[calc(100vw-1.5rem)] [&_button]:whitespace-nowrap`;

  return (
    <div className="flex flex-col gap-3">
      <div
        className="flex flex-col gap-2 px-3 sm:px-4 pt-3 sm:pt-4 border-b border-border-mid pb-3"
        role="search"
        aria-label={t("queue.reviewFilterSearch")}
      >
        <div className="flex flex-wrap items-end gap-2 sm:gap-3">
          <div className="flex flex-col gap-0.5 min-w-0">
            <label className="text-3xs font-semibold uppercase tracking-wide text-muted" htmlFor="review-filter-confidence">
              {t("queue.reviewFilterConfidence")}
            </label>
            <SelectDropdown
              open={confidenceMenuOpen}
              onOpenChange={setConfidenceMenuOpen}
              triggerId="review-filter-confidence"
              triggerLabel={confidenceTriggerLabel}
              ariaLabel={t("queue.reviewFilterConfidence")}
              triggerClassName={filterDropdownTriggerClass}
              portaled
            >
              <div role="listbox" aria-label={t("queue.reviewFilterConfidence")} className={SELECT_DROPDOWN_PANEL_CLASS}>
                {(["all", "high", "medium", "low"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="option"
                    aria-selected={confidenceFilter === v}
                    onClick={() => {
                      setConfidenceFilter(v);
                      setConfidenceMenuOpen(false);
                      trackFilter("confidence", v);
                    }}
                    className={selectDropdownPlainOptionClassName(confidenceFilter === v)}
                  >
                    {v === "all"
                      ? t("queue.reviewFilterConfidenceAll")
                      : v === "high"
                        ? t("queue.reviewFilterConfidenceHigh")
                        : v === "medium"
                          ? t("queue.reviewFilterConfidenceMedium")
                          : t("queue.reviewFilterConfidenceLow")}
                  </button>
                ))}
              </div>
            </SelectDropdown>
          </div>
          <div className="flex flex-col gap-0.5 min-w-[12rem] sm:min-w-[14rem] shrink-0">
            <label className="text-3xs font-semibold uppercase tracking-wide text-muted" htmlFor="review-filter-approval">
              {t("queue.reviewFilterApproval")}
            </label>
            <SelectDropdown
              open={approvalMenuOpen}
              onOpenChange={setApprovalMenuOpen}
              triggerId="review-filter-approval"
              triggerLabel={approvalTriggerLabel}
              ariaLabel={t("queue.reviewFilterApproval")}
              triggerClassName={approvalFilterTriggerClass}
              portaled
            >
              <div role="listbox" aria-label={t("queue.reviewFilterApproval")} className={approvalFilterPanelClass}>
                {(["all", "needsReview", "approved"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="option"
                    aria-selected={approvalFilter === v}
                    onClick={() => {
                      setApprovalFilter(v);
                      setApprovalMenuOpen(false);
                      trackFilter("approval", v);
                    }}
                    className={selectDropdownPlainOptionClassName(approvalFilter === v)}
                  >
                    {v === "all"
                      ? t("queue.reviewFilterApprovalAll")
                      : v === "needsReview"
                        ? t("queue.reviewFilterApprovalNeedsReview")
                        : t("queue.reviewFilterApprovalApproved")}
                  </button>
                ))}
              </div>
            </SelectDropdown>
          </div>
          <label className="flex flex-col gap-0.5 flex-1 min-w-[8rem]">
            <span className="text-3xs font-semibold uppercase tracking-wide text-muted">
              {t("queue.reviewFilterSearch")}
            </span>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onBlur={(e) =>
                trackFilter("search", e.currentTarget.value.trim() ? "active" : "cleared")
              }
              placeholder={t("queue.reviewFilterSearchPlaceholder")}
              className="rounded-lg border border-border bg-bg-secondary px-2 py-1.5 text-2xs text-text-primary placeholder:text-muted/70 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/25 w-full min-w-0"
              autoComplete="off"
            />
          </label>
        </div>
      </div>

      {filteredRows.length === 0 ? (
        <p className="px-3 sm:px-4 pb-4 text-sm text-muted text-center">{t("queue.reviewFilterEmpty")}</p>
      ) : (
        <>
          {/*
            Explicit scrollport height and no CSS `contain: strict` (size containment collapsed
            this region to a few pixels tall, so cards looked “squashed”).
          */}
          <div
            ref={reviewScrollRef}
            className="h-[min(70vh,42rem)] min-h-[16rem] overflow-y-auto overflow-x-hidden p-3 sm:p-4 pt-0"
            role="list"
            aria-label="Files to review"
          >
            <div
              className="relative w-full"
              style={{ height: reviewVirtualizer.getTotalSize() > 0 ? reviewVirtualizer.getTotalSize() : 0 }}
            >
              {reviewVirtualizer.getVirtualItems().map((virtualRow) => {
                const start = virtualRow.index * columnCount;
                const slice = filteredRows.slice(start, start + columnCount);
                const gridClass =
                  columnCount === 3
                    ? "grid grid-cols-3 gap-2 w-full"
                    : columnCount === 2
                      ? "grid grid-cols-2 gap-2 w-full"
                      : "grid grid-cols-1 gap-2 w-full";
                return (
                  <div
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={reviewVirtualizer.measureElement}
                    className="absolute left-0 top-0 w-full min-w-0 pb-2"
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    <div className={gridClass}>
                      {slice.map((r) => (
                        <ReviewTableCard
                          key={r.path}
                          r={r}
                          onToggleApproved={onToggleApproved}
                          onEditFolder={onEditFolder}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
