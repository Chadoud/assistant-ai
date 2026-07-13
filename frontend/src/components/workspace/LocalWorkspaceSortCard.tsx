import { useCallback, useState } from "react";
import { useI18n } from "../../i18n/I18nContext";
import DropZone from "../DropZone";

interface LocalWorkspaceSortCardProps {
  includeLocalInRun: boolean;
  onIncludeLocalInRunChange: (next: boolean) => void;
  stagedPaths: readonly string[];
  onAddPaths: (paths: string[]) => void;
  onRemovePath: (path: string) => void;
  disabled: boolean;
  disabledReason?: string;
}

function pathTail(path: string, max = 56): string {
  const t = path.trim();
  if (t.length <= max) return t;
  return `…${t.slice(-(max - 1))}`;
}

/**
 * Workspace card for local disk sorts: optional inclusion in batch Run, staged paths, drop/browse inside an expandable shell (matches Gmail workspace block layout).
 */
export default function LocalWorkspaceSortCard({
  includeLocalInRun,
  onIncludeLocalInRunChange,
  stagedPaths,
  onAddPaths,
  onRemovePath,
  disabled,
  disabledReason,
}: LocalWorkspaceSortCardProps) {
  const { t } = useI18n();
  const [sectionOpen, setSectionOpen] = useState(false);

  const onDropZoneFiles = useCallback(
    (paths: string[]) => {
      if (paths.length) onAddPaths(paths);
    },
    [onAddPaths]
  );

  return (
    <section
      id="workspace-local"
      className="flex gap-3 items-start scroll-mt-28 min-w-0 w-full"
      aria-labelledby="workspace-local-heading"
    >
      <label
        className={`flex shrink-0 items-center self-center pl-0.5 ${
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
        }`}
        title={t("queue.workspaceIncludeLocalInRun")}
      >
        <input
          type="checkbox"
          className="accent-accent h-4 w-4 shrink-0 rounded border-border"
          checked={includeLocalInRun}
          disabled={disabled}
          aria-label={t("queue.workspaceIncludeLocalInRun")}
          onChange={(e) => onIncludeLocalInRunChange(e.target.checked)}
        />
      </label>

      <div className="min-w-0 flex-1 rounded-xl border border-border bg-bg-card overflow-hidden shadow-sm shadow-black/[0.03] dark:shadow-black/15 flex flex-col">
        <h2 id="workspace-local-heading" className="sr-only">
          {t("queue.workspaceLocalHeading")}
        </h2>

        <button
          type="button"
          className="w-full flex items-center gap-3 p-4 text-left hover:bg-bg-secondary/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
          onClick={() => setSectionOpen((o) => !o)}
          aria-expanded={sectionOpen}
          aria-controls="workspace-local-panel"
          id="workspace-local-toggle"
        >
          <div className="w-9 h-9 rounded-lg bg-bg-secondary flex items-center justify-center shrink-0 border border-border/80">
            <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v8.25m19.5 0v.75A2.25 2.25 0 0 1 19.5 17.25h-15a2.25 2.25 0 0 1-2.25-2.25V13.5"
              />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-text-primary">{t("queue.workspaceLocalHeading")}</span>
            </div>
            <p className="text-2xs text-muted mt-0.5 leading-snug">{t("queue.workspaceLocalSummary")}</p>
          </div>
          <svg
            className={`w-5 h-5 shrink-0 text-muted transition-transform ${sectionOpen ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </button>

        {sectionOpen && (
          <div
            id="workspace-local-panel"
            role="region"
            aria-labelledby="workspace-local-toggle"
            className="px-4 pb-4 pt-3 space-y-3 border-t border-border flex-1 flex flex-col min-h-0"
          >
            <DropZone
              density="compact"
              matchWorkspaceScanBlockHeight
              onFiles={onDropZoneFiles}
              disabled={disabled}
              disabledReason={disabledReason}
            />
            {stagedPaths.length > 0 && (
              <div className="rounded-lg border border-border bg-bg-secondary/40 px-3 py-2 space-y-2">
                <p className="text-2xs font-semibold text-muted uppercase tracking-wider">{t("queue.workspaceStagedHeading")}</p>
                <ul className="max-h-32 overflow-y-auto space-y-1">
                  {stagedPaths.map((p) => (
                    <li key={p} className="flex items-center gap-2 min-w-0 text-xs">
                      <span className="truncate flex-1 font-mono text-text-primary" title={p}>
                        {pathTail(p, 64)}
                      </span>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => onRemovePath(p)}
                        className="shrink-0 text-2xs text-muted hover:text-error px-2 py-1 rounded-lg hover:bg-hover-overlay disabled:opacity-40"
                      >
                        {t("queue.workspaceRemoveStaged")}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
