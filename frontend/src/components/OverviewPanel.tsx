import { useMemo } from "react";
import FolderTree from "./FolderTree";
import HoverHelpCard from "./ui/HoverHelpCard";
import type { Job, FileEntry, FolderNode } from "../api";
import { useI18n } from "../i18n/I18nContext";

const KNOWN_JOB_PHASES = new Set([
  "analyzing",
  "awaiting_approval",
  "applying",
  "paused",
  "cancelled",
  "done",
]);

interface OverviewPanelProps {
  currentJob: Job | null;
  /** False when user has not set an output directory — show setup-first empty state. */
  hasOutputDir: boolean;
  folderTree: FolderNode[];
  folderViewMode: "rows" | "grid";
  setFolderViewMode: (mode: "rows" | "grid") => void;
  refreshTree: () => void | Promise<void>;
  /** Last folder-tree fetch error (e.g. API offline). */
  treeRefreshError?: string | null;
  onDismissTreeError?: () => void;
  onOpenFolder: (path: string) => void;
  onRevealFile: (path: string) => void;
  // Derived job view
  doneCount: number;
  activeFiles: FileEntry[];
  failedFiles: FileEntry[];
  /** Gmail attachment downloads that failed during import (not sort pipeline errors). */
  fetchFailureCount: number;
  pendingCount: number;
  /** True while a job is actively processing (running or paused). */
  isJobRunning: boolean;
  onGoToSort: () => void;
  onChooseOutputFolder: () => void;
}

export default function OverviewPanel({
  currentJob,
  hasOutputDir,
  folderTree,
  folderViewMode,
  setFolderViewMode,
  refreshTree,
  treeRefreshError,
  onDismissTreeError,
  onOpenFolder,
  onRevealFile,
  doneCount,
  activeFiles,
  failedFiles,
  fetchFailureCount,
  pendingCount,
  isJobRunning,
  onGoToSort,
  onChooseOutputFolder,
}: OverviewPanelProps) {
  const { t } = useI18n();
  const phaseLabel = (p: string) =>
    KNOWN_JOB_PHASES.has(p) ? t(`queue.phase.${p}`) : p;
  const totalFiles = useMemo(() => {
    const countInNode = (n: FolderNode): number =>
      n.files.length + (n.children ?? []).reduce((s, c) => s + countInNode(c), 0);
    return folderTree.reduce((acc, f) => acc + countInNode(f), 0);
  }, [folderTree]);

  const totalFolderNodes = useMemo(() => {
    const walk = (nodes: FolderNode[]): number =>
      nodes.reduce((acc, n) => acc + 1 + walk(n.children ?? []), 0);
    return walk(folderTree);
  }, [folderTree]);

  return (
    <div className="space-y-4">
      <header data-tour="overview-panel-intro" className="flex items-start justify-between gap-2">
        <HoverHelpCard hint={t("overview.introHint")}>
          <h1 className="text-lg font-semibold text-text-primary">{t("overview.title")}</h1>
        </HoverHelpCard>
      </header>

      {!hasOutputDir && (
        <div className="rounded-xl border border-dashed border-warning-line bg-warning-soft/40 px-6 py-6 text-center space-y-3">
          <p className="text-sm font-medium text-text-primary">{t("overview.chooseOutputTitle")}</p>
          <p className="text-xs text-muted max-w-md mx-auto leading-relaxed">{t("overview.chooseOutputBody")}</p>
          <button
            type="button"
            onClick={onChooseOutputFolder}
            className="inline-flex items-center justify-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl bg-button-primary text-white hover:bg-button-hover transition-colors"
          >
            {t("overview.chooseOutputCta")}
          </button>
        </div>
      )}

      {hasOutputDir && (
        <>
      {treeRefreshError && (
        <div
          className="rounded-xl border border-warning-line bg-warning-soft px-4 py-3 text-sm text-warning"
          role="alert"
        >
          <div className="flex flex-wrap items-start justify-between gap-2 gap-y-2">
            <p className="leading-relaxed min-w-0 flex-1">
              <span className="font-semibold block text-warning mb-0.5">{t("overview.treeRefreshTitle")}</span>
              {treeRefreshError}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void refreshTree()}
                className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-warning-line bg-bg-card hover:bg-hover-overlay transition-colors"
              >
                {t("overview.retry")}
              </button>
              {onDismissTreeError && (
                <button
                  type="button"
                  onClick={onDismissTreeError}
                  className="text-xs font-medium text-muted hover:text-text-primary"
                >
                  {t("overview.dismiss")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {currentJob && (
        <section className="rounded-xl border border-border bg-bg-card p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
            {t("overview.processingStatus")}
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
            <div className="rounded-lg border border-border bg-bg-secondary px-3 py-2">
              <p className="text-2xs uppercase tracking-wider text-muted">{t("overview.metricProcessed")}</p>
              <p className="text-sm font-semibold text-success">{doneCount}</p>
            </div>
            <div className="rounded-lg border border-border bg-bg-secondary px-3 py-2">
              <p className="text-2xs uppercase tracking-wider text-muted">{t("overview.metricProcessing")}</p>
              <p className="text-sm font-semibold text-info">{activeFiles.length}</p>
            </div>
            <div className="rounded-lg border border-border bg-bg-secondary px-3 py-2">
              <p className="text-2xs uppercase tracking-wider text-muted">{t("overview.metricPending")}</p>
              <p className="text-sm font-semibold text-warning">{pendingCount}</p>
            </div>
            <div className="rounded-lg border border-border bg-bg-secondary px-3 py-2">
              <p className="text-2xs uppercase tracking-wider text-muted">{t("overview.metricFailedSort")}</p>
              <p className="text-sm font-semibold text-error">{failedFiles.length}</p>
            </div>
            <div className="rounded-lg border border-border bg-bg-secondary px-3 py-2">
              <p className="text-2xs uppercase tracking-wider text-muted">{t("overview.metricFailedFetch")}</p>
              <p className="text-sm font-semibold text-error">{fetchFailureCount}</p>
            </div>
          </div>

          <div className="text-xs text-muted">
            {currentJob.status === "running"
              ? t("overview.jobRunningDetail", {
                  completed: currentJob.completed,
                  total: currentJob.total,
                })
              : t("overview.jobPhaseDetail", {
                  phase: phaseLabel(currentJob.phase),
                  done: doneCount,
                  failedSort: failedFiles.length,
                  failedFetch: fetchFailureCount,
                  total: currentJob.total,
                })}
          </div>

          {activeFiles.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-text-primary">{t("overview.currentlyProcessing")}</p>
              <div className="space-y-1">
                {activeFiles.slice(0, 8).map((f) => (
                  <div key={f.path} className="text-xs text-muted truncate">
                    {f.name} · {f.status}
                  </div>
                ))}
                {activeFiles.length > 8 && (
                  <p className="text-xs text-muted">
                    {t("overview.moreFiles", { count: activeFiles.length - 8 })}
                  </p>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {!treeRefreshError && folderTree.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-bg-secondary/50 px-6 py-8 text-center space-y-3">
          {isJobRunning ? (
            <>
              <p className="text-sm text-muted">{t("overview.treeWhileRunningHint")}</p>
              <p className="text-2xs text-muted">{t("overview.treeAfterJobHint")}</p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-text-primary">{t("overview.emptyTreeTitle")}</p>
              <p className="text-xs text-muted max-w-md mx-auto leading-relaxed">
                {t("overview.emptyTreeBody")}
              </p>
              <button
                type="button"
                onClick={onGoToSort}
                className="inline-flex items-center justify-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl bg-button-primary text-white hover:bg-button-hover transition-colors"
              >
                {t("overview.goToSort")}
              </button>
            </>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-text-primary min-w-0 truncate">
          {t("overview.sortedFolders")}
          {folderTree.length > 0 && (
            <span className="ml-2 text-xs font-normal text-muted">
              {totalFolderNodes === 1
                ? t("overview.folderStatsOneFolder", { fileCount: totalFiles })
                : t("overview.folderStats", { folderCount: totalFolderNodes, fileCount: totalFiles })}
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setFolderViewMode(folderViewMode === "rows" ? "grid" : "rows")}
            className="px-2 py-1 rounded-lg text-xs border border-border text-muted hover:text-text-primary hover:bg-hover-overlay transition-colors"
            title={t("overview.viewToggleTitle")}
          >
            {t("overview.viewLabel", {
              mode: folderViewMode === "rows" ? t("overview.rows") : t("overview.grid"),
            })}
          </button>
          <button
            onClick={refreshTree}
            className="p-1.5 rounded-lg text-muted hover:text-text-primary hover:bg-hover-overlay transition-colors"
            title={t("overview.refresh")}
            aria-label={t("overview.refresh")}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
              />
            </svg>
          </button>
        </div>
      </div>

      {folderTree.length > 0 && (
        <FolderTree
          tree={folderTree}
          viewMode={folderViewMode}
          onOpenFolder={onOpenFolder}
          onRevealFile={onRevealFile}
        />
      )}
        </>
      )}
    </div>
  );
}
