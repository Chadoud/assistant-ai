import type { UseModelsReturn } from "../hooks/useModels";

type Props = Pick<
  UseModelsReturn,
  | "installingModelName"
  | "installProgress"
  | "installPhase"
  | "cancelInstall"
>;

/**
 * Shown when a model is downloading and the user left Settings — pull continues
 * in useModels (App-level); this keeps progress visible on other tabs.
 */
export default function ModelDownloadBanner({
  installingModelName,
  installProgress,
  installPhase,
  cancelInstall,
}: Props) {
  if (!installingModelName) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[200] border-t border-accent-line bg-bg-card/95 backdrop-blur-sm shadow-lg px-4 py-2.5 flex flex-wrap items-center gap-3 pointer-events-auto"
      role="status"
      aria-live="polite"
      aria-label="Model download in progress"
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="w-2 h-2 rounded-full bg-accent animate-pulse shrink-0" />
        <span className="text-xs font-semibold text-text-primary truncate">
          <span className="text-muted font-normal">Downloading model · </span>
          <span className="font-mono text-accent">{installingModelName}</span>
        </span>
        {installProgress >= 0 && (
          <span className="text-xs font-bold text-accent tabular-nums shrink-0">{installProgress}%</span>
        )}
        <span className="text-2xs text-muted truncate max-w-[min(40vw,240px)] capitalize">
          {installPhase
            ? installPhase.replace(/\b[0-9a-f]{8,}\b/gi, "layer").replace(/pulling/i, "Pulling")
            : "Preparing…"}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="hidden sm:block w-32 h-1.5 rounded-full bg-surface-subtle overflow-hidden">
          {installProgress >= 0 ? (
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{ width: `${installProgress}%` }}
            />
          ) : (
            <div className="h-full w-full rounded-full bg-accent opacity-70 animate-pulse" />
          )}
        </div>
        <button
          type="button"
          onClick={cancelInstall}
          className="text-2xs px-2.5 py-1 rounded-lg border border-error-line text-error hover:bg-error-soft font-medium"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
