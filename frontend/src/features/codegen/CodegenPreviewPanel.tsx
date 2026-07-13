import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useI18n } from "../../i18n/I18nContext";
import {
  MAX_SELF_CORRECT_ATTEMPTS,
  hydrateCodegenSession,
  retryCodegenDevPipeline,
  stopCodegenSession,
  useCodegenState,
  usePendingCodegenLaunchGoal,
  type CodegenPhase,
  type CodegenState,
} from "./codegenStore";

interface CodegenPreviewPanelProps {
  sessionId: string | null;
  /** When false, detach the native WebContentsView overlay (e.g. Exo tab is visually hidden). */
  overlayVisible?: boolean;
}

type Translate = (key: string, vars?: Record<string, string | number>) => string;

function phaseLabel(t: Translate, phase: CodegenPhase, repairAttempts = 0): string {
  switch (phase) {
    case "planning":
      return t("assistant.codegen.phasePlanning");
    case "scaffolding":
      return t("assistant.codegen.phaseScaffolding");
    case "generating":
      return t("assistant.codegen.phaseGenerating");
    case "installing":
      return t("assistant.codegen.phaseInstalling");
    case "starting":
      return t("assistant.codegen.phaseStarting");
    case "verifying":
      return t("assistant.codegen.phaseVerifying");
    case "repairing":
      // Real attempt count from the repair loop — honest progress, not synthetic.
      return repairAttempts > 0
        ? t("assistant.codegen.phaseRepairingAttempt", {
            current: repairAttempts,
            max: MAX_SELF_CORRECT_ATTEMPTS,
          })
        : t("assistant.codegen.phaseRepairing");
    case "ready":
      return t("assistant.codegen.phaseReady");
    case "error":
      return t("assistant.codegen.phaseError");
    case "cancelled":
      return t("assistant.codegen.phaseCancelled");
    default:
      return t("assistant.codegen.phaseIdle");
  }
}

/** Plain-language cause for a diagnosed build failure (null when unknown). */
function errorCauseLabel(t: Translate, state: CodegenState): string | null {
  const names = state.errorPackages.join(", ");
  switch (state.errorClass) {
    case "missing_npm_package":
      return names ? t("assistant.codegen.causeMissingPackage", { names }) : null;
    case "install_registry_error":
      return names ? t("assistant.codegen.causeRegistry", { names }) : null;
    case "missing_local_file":
      return t("assistant.codegen.causeMissingFile");
    case "syntax_error":
      return t("assistant.codegen.causeSyntax");
    case "css_tailwind":
      return t("assistant.codegen.causeCss");
    case "port_conflict":
      return t("assistant.codegen.causePort");
    default:
      return null;
  }
}

function splitPath(path: string): { name: string; dir: string } {
  const parts = path.split(/[\\/]/).filter(Boolean);
  const name = parts.pop() ?? path;
  return { name, dir: parts.join("/") };
}

/**
 * Electron's draggable title bar (`-webkit-app-region: drag`) bleeds into other
 * DOM regions once a native WebContentsView child is attached (electron#43320,
 * present through 34.x): any point covered by a draggable region swallows mouse
 * clicks. The live preview attaches such a view, so every interactive control in
 * this panel must opt out explicitly — otherwise the toolbar buttons go dead.
 */
const NO_DRAG_STYLE = { WebkitAppRegion: "no-drag" } as CSSProperties;

// ── Icons (14px, inherit currentColor) ─────────────────────────────────────────
const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "h-3.5 w-3.5 shrink-0",
  "aria-hidden": true,
};
const ReloadIcon = () => (
  <svg {...iconProps}>
    <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
  </svg>
);
const ExternalIcon = () => (
  <svg {...iconProps}>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />
  </svg>
);
const FolderIcon = () => (
  <svg {...iconProps}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
  </svg>
);
const LogsIcon = () => (
  <svg {...iconProps}>
    <path d="M4 6h16M4 12h10M4 18h7" />
  </svg>
);
const RetryIcon = () => (
  <svg {...iconProps}>
    <path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" />
  </svg>
);
const StopIcon = () => (
  <svg {...iconProps}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);
const FileGlyph = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden className="h-3.5 w-3.5 shrink-0">
    <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v4a1 1 0 0 0 1 1h4M5 3h9l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
  </svg>
);
const CheckGlyph = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden className="h-3 w-3 shrink-0">
    <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
  </svg>
);

function ToolButton({
  onClick,
  icon,
  label,
  tone = "default",
}: {
  onClick: () => void;
  icon: ReactNode;
  label: string;
  tone?: "default" | "accent" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "text-error hover:bg-error-faint hover:text-error"
      : tone === "accent"
        ? "text-accent hover:bg-accent-faint"
        : "text-muted hover:bg-hover-overlay hover:text-text-primary";
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      style={NO_DRAG_STYLE}
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors ${toneClass}`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

/** Minimum host size (px) before we attach or reposition the native preview overlay. */
const PREVIEW_HOST_MIN_PX = 2;

/** Live preview surface for Codegen Studio (WebContentsView overlay + toolbar). */
export default function CodegenPreviewPanel({
  sessionId,
  overlayVisible = true,
}: CodegenPreviewPanelProps) {
  const { t } = useI18n();
  const state = useCodegenState(sessionId ?? undefined);
  const pendingLaunchGoal = usePendingCodegenLaunchGoal();
  const hostRef = useRef<HTMLDivElement>(null);
  const [logsOpen, setLogsOpen] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    void hydrateCodegenSession(sessionId);
  }, [sessionId]);

  useEffect(() => {
    if (state?.phase === "error" && state.logTail) setLogsOpen(true);
  }, [state?.phase, state?.logTail]);

  // Keep the native preview overlay aligned to the host element. A rAF diff loop
  // tracks BOTH position and size: the host can shift vertically when toolbar/
  // status rows appear above it, which a ResizeObserver alone would miss.
  const previewUrl = state?.previewUrl;
  // Mount the native preview once the server is up (ready) and keep it mounted
  // through verification so the render probe can inspect the live DOM.
  const previewMounted = state?.phase === "ready" || state?.phase === "verifying";
  const overlayActive =
    overlayVisible && previewMounted && Boolean(sessionId && previewUrl && window.electronAPI?.codegenPreviewSetBounds);

  // Detach the native overlay whenever it must not be shown (tab switch, rail change, unmount).
  useEffect(() => {
    if (overlayActive || !sessionId) return;
    window.electronAPI?.codegenPreviewHide?.({ sessionId });
  }, [overlayActive, sessionId]);

  useEffect(() => {
    const api = window.electronAPI;
    if (!overlayActive || !sessionId || !previewUrl || !api?.codegenPreviewSetBounds) return;

    let raf = 0;
    let last = { x: 0, y: 0, width: 0, height: 0 };
    const MOVE_EPSILON_PX = 0.5;
    const moved = (r: typeof last) =>
      Math.abs(r.x - last.x) > MOVE_EPSILON_PX ||
      Math.abs(r.y - last.y) > MOVE_EPSILON_PX ||
      Math.abs(r.width - last.width) > MOVE_EPSILON_PX ||
      Math.abs(r.height - last.height) > MOVE_EPSILON_PX;

    const loop = () => {
      const host = hostRef.current;
      if (host) {
        const rect = host.getBoundingClientRect();
        const next = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        if (next.width < PREVIEW_HOST_MIN_PX || next.height < PREVIEW_HOST_MIN_PX) {
          void api.codegenPreviewHide?.({ sessionId });
        } else if (moved(next)) {
          last = next;
          void api.codegenPreviewSetBounds({ sessionId, url: previewUrl, bounds: next });
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.electronAPI?.codegenPreviewHide?.({ sessionId });
    };
  }, [overlayActive, sessionId, previewUrl]);

  if (!sessionId || !state) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-sm text-muted">
        {pendingLaunchGoal ? (
          <>
            <span className="inline-flex items-center gap-2 text-text-primary">
              <span className="h-2 w-2 animate-pulse rounded-full bg-accent" aria-hidden />
              {t("assistant.codegen.starting")}
            </span>
            <p className="line-clamp-3 text-xs">{pendingLaunchGoal}</p>
          </>
        ) : (
          <p>{t("assistant.codegen.previewIdle")}</p>
        )}
      </div>
    );
  }

  const handleOpenBrowser = () => {
    if (state.previewUrl) void window.electronAPI?.openExternal?.(state.previewUrl);
  };
  const handleOpenFolder = () => {
    if (state.projectPath) void window.electronAPI?.codegenOpenProjectFolder?.({ path: state.projectPath });
  };
  const handleStop = () => void stopCodegenSession(sessionId);
  const handleReload = () => void window.electronAPI?.codegenPreviewReload?.({ sessionId });
  const handleRetry = () => void retryCodegenDevPipeline(sessionId);

  const showWorkingOverlay = state.phase !== "ready" && state.phase !== "cancelled";
  const isGenerating = state.phase === "generating" || state.phase === "scaffolding";
  const overlayStatusHint =
    state.filesWritten > 0 ? t("assistant.codegen.filesWritten", { count: state.filesWritten }) : null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg-primary">
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div
        className="flex shrink-0 items-center justify-end gap-0.5 border-b border-border px-3 py-2"
        style={NO_DRAG_STYLE}
      >
        {state.phase === "ready" && (
          <>
            <ToolButton onClick={handleReload} icon={<ReloadIcon />} label={t("assistant.codegen.reload")} />
            <ToolButton onClick={handleOpenBrowser} icon={<ExternalIcon />} label={t("assistant.codegen.openBrowser")} tone="accent" />
          </>
        )}
        {state.phase === "error" && (
          <ToolButton onClick={handleRetry} icon={<RetryIcon />} label={t("assistant.codegen.retry")} tone="accent" />
        )}
        {state.projectPath && (
          <ToolButton onClick={handleOpenFolder} icon={<FolderIcon />} label={t("assistant.codegen.openFolder")} />
        )}
        {(state.logTail || showWorkingOverlay) && (
          <ToolButton
            onClick={() => setLogsOpen((v) => !v)}
            icon={<LogsIcon />}
            label={logsOpen ? t("assistant.codegen.hideLogs") : t("assistant.codegen.viewLogs")}
          />
        )}
        {state.phase !== "idle" && state.phase !== "cancelled" && (
          <ToolButton onClick={handleStop} icon={<StopIcon />} label={t("assistant.codegen.stop")} tone="danger" />
        )}
      </div>

      {/* ── Inline status rows ───────────────────────────────────────────── */}
      {state.relayNotice && (
        <p className="shrink-0 px-3 py-1.5 text-2xs text-warning">{state.relayNotice}</p>
      )}
      {state.error && (
        <div
          className="mx-3 mt-2 shrink-0 rounded-lg border border-error-line bg-error-faint px-3 py-2 text-xs text-error"
          role="alert"
        >
          {(() => {
            const cause = errorCauseLabel(t, state);
            return cause ? <p className="mb-1 font-medium">{cause}</p> : null;
          })()}
          <p className="whitespace-pre-wrap">{state.error}</p>
        </div>
      )}
      {state.phase === "ready" && state.previewUrl && (
        <button
          type="button"
          onClick={handleOpenBrowser}
          title={state.previewUrl}
          style={NO_DRAG_STYLE}
          className="flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-left text-2xs text-muted transition-colors hover:text-accent"
        >
          <span className="truncate font-mono">{state.previewUrl}</span>
        </button>
      )}

      {logsOpen && state.logTail && (
        <pre className="mx-3 mt-2 max-h-40 shrink-0 overflow-auto rounded-lg border border-border-soft bg-bg-secondary px-3 py-2 text-left text-2xs leading-relaxed text-muted">
          {state.logTail.slice(-4000)}
        </pre>
      )}

      {/* ── Canvas / working surface ─────────────────────────────────────── */}
      <div
        ref={hostRef}
        className="relative mt-2 min-h-0 flex-1 bg-[#f4f4f5]"
        data-codegen-preview-host={sessionId}
      >
        {showWorkingOverlay && (
          <div className="absolute inset-0 flex flex-col items-center overflow-hidden bg-bg-primary">
            <div className="flex min-h-0 w-full max-w-md flex-1 flex-col gap-4 px-6 py-8">
              {/* Status header */}
              <div className="flex items-center gap-3">
                <span
                  className="h-6 w-6 shrink-0 animate-spin rounded-full border-2 border-border-soft border-t-accent"
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text-primary">
                    {phaseLabel(t, state.phase, state.repairAttempts)}
                  </p>
                  {overlayStatusHint ? (
                    <p className="truncate text-2xs text-muted">{overlayStatusHint}</p>
                  ) : null}
                </div>
              </div>

              {/* Live file stream */}
              {state.recentFiles.length > 0 ? (
                <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border-soft bg-bg-secondary">
                  <div className="flex items-center justify-between border-b border-border-soft px-3 py-2">
                    <span className="text-2xs font-semibold uppercase tracking-wide text-muted">
                      {t("assistant.codegen.recentFiles")}
                    </span>
                  </div>
                  <ul className="max-h-full overflow-auto p-1">
                    {state.recentFiles.map((file, i) => {
                      const { name, dir } = splitPath(file);
                      const active = i === 0 && isGenerating;
                      return (
                        <li
                          key={file}
                          className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 ${
                            active ? "bg-accent-faint" : ""
                          }`}
                        >
                          {active ? (
                            <span className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden>
                              <span className="block h-2 w-2 translate-x-[3px] translate-y-[3px] animate-pulse rounded-full bg-accent" />
                            </span>
                          ) : (
                            <span className="text-success" aria-hidden>
                              <CheckGlyph />
                            </span>
                          )}
                          <span className="shrink-0 text-muted">
                            <FileGlyph />
                          </span>
                          <span className="truncate font-mono text-xs text-text-primary">{name}</span>
                          {dir && (
                            <span className="ml-auto hidden truncate pl-2 text-2xs text-muted sm:inline" title={file}>
                              {dir}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center">
                  <div
                    aria-hidden
                    className="h-7 w-7 animate-spin rounded-full border-2 border-border-soft border-t-accent"
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
