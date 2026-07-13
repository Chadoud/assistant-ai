import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { useI18n } from "../i18n/I18nContext";
import { WORKSPACE_SCAN_BLOCK_HEIGHT_CLASS } from "../utils/styles";
import { hasElectronBridge } from "../utils/platform";
import type { BrowserUploadContext } from "../utils/analysisModelReadiness";

interface DropZoneProps {
  onFiles: (paths: string[]) => void | Promise<void>;
  /** When set (typically web), drops and picker send real ``File`` objects for multipart upload. */
  onBrowserFiles?: (files: File[], context?: BrowserUploadContext) => void | Promise<void>;
  disabled?: boolean;
  /** Shown under the main copy when disabled (e.g. API offline). */
  disabledReason?: string;
  /**
   * `compact` — shorter shell and smaller chrome for workspace cards so neighbors align with Gmail.
   * `default` — welcome / web queue.
   */
  density?: "default" | "compact";
  /** With `compact`, lock height to {@link WORKSPACE_SCAN_BLOCK_HEIGHT_CLASS} (Gmail “Search and limits” inset). */
  matchWorkspaceScanBlockHeight?: boolean;
}

export default function DropZone({
  onFiles,
  onBrowserFiles,
  disabled,
  disabledReason,
  density = "default",
  matchWorkspaceScanBlockHeight = false,
}: DropZoneProps) {
  const { t } = useI18n();
  const [dragging, setDragging] = useState(false);
  const desktopApp = hasElectronBridge();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const webMultipart = Boolean(!desktopApp && onBrowserFiles);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback(() => {
    setDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (disabled) return;

      if (!desktopApp && onBrowserFiles) {
        const list = e.dataTransfer.files;
        if (list?.length) void onBrowserFiles(Array.from(list));
        return;
      }

      const paths: string[] = [];
      for (const item of Array.from(e.dataTransfer.items)) {
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) {
            const osPath = (file as File & { path?: string }).path ?? file.name;
            paths.push(osPath);
          }
        }
      }
      if (paths.length > 0) onFiles(paths);
    },
    [disabled, desktopApp, onBrowserFiles, onFiles]
  );

  const handleClick = useCallback(() => {
    if (disabled) return;
    if (window.electronAPI?.openFilesOrFolders) {
      window.electronAPI.openFilesOrFolders().then((paths: string[]) => {
        if (paths?.length > 0) onFiles(paths);
      });
      return;
    }
    if (window.electronAPI?.openFiles) {
      window.electronAPI.openFiles().then((paths: string[]) => {
        if (paths?.length > 0) onFiles(paths);
      });
      return;
    }
    if (onBrowserFiles) {
      fileInputRef.current?.click();
      return;
    }
    toast.message(t("queue.outputBrowseNeedsDesktop"), { duration: 9000 });
  }, [disabled, onBrowserFiles, onFiles, t]);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const list = e.target.files;
      if (list?.length && onBrowserFiles) void onBrowserFiles(Array.from(list), { fromFolderPicker: true });
      e.target.value = "";
    },
    [onBrowserFiles]
  );

  const compact = density === "compact";
  const heightLockClass = compact && matchWorkspaceScanBlockHeight ? WORKSPACE_SCAN_BLOCK_HEIGHT_CLASS : "";
  const minHeightClass = compact
    ? matchWorkspaceScanBlockHeight
      ? ""
      : "min-h-[88px] sm:min-h-[96px]"
    : "min-h-[140px] sm:min-h-[200px]";
  const innerGapClass = compact ? "gap-2" : "gap-3";
  const iconShellClass = compact ? "w-11 h-11 rounded-xl" : "w-16 h-16 rounded-2xl";
  const iconSvgClass = compact ? "w-5 h-5" : "w-8 h-8";
  const titleClass = compact ? "text-sm font-semibold" : "text-base font-semibold";
  const hintClass = compact ? "text-xs mt-0.5" : "text-sm mt-1";

  return (
    <div
      data-tour="drop-zone"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      className={`
        relative flex flex-col items-center ${heightLockClass ? "min-h-0 overflow-hidden" : "justify-center"}
        rounded-2xl border-2 border-dashed transition-all duration-200
        ${minHeightClass} ${heightLockClass} cursor-pointer select-none
        motion-safe:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent
        ${dragging
          ? "border-accent bg-accent-light scale-[1.01] ring-2 ring-accent/25"
          : disabled
          ? "border-border opacity-50 cursor-not-allowed"
          : "border-accent-line bg-accent-light/35 hover:border-accent hover:bg-accent-light shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]"
        }
      `}
    >
      {webMultipart && (
        <input
          ref={fileInputRef}
          type="file"
          // Folder-selection mode: Open works on a highlighted folder (unlike `multiple` file-only pickers).
          {...{ webkitdirectory: "" }}
          multiple
          className="sr-only"
          aria-hidden
          tabIndex={-1}
          onChange={handleFileInputChange}
        />
      )}
      {dragging && (
        <span className="absolute inset-0 rounded-2xl animate-ping border border-accent opacity-30 pointer-events-none" />
      )}

      <div
        className={`flex flex-col items-center justify-center ${innerGapClass} pointer-events-none w-full px-3 sm:px-4 ${
          heightLockClass ? "min-h-0 flex-1 overflow-y-auto" : ""
        }`}
      >
        <div
          className={`${iconShellClass} flex items-center justify-center transition-colors
            ${dragging ? "bg-accent" : "bg-bg-secondary"}`}
        >
          <svg
            className={`${iconSvgClass} transition-colors ${dragging ? "text-white" : "text-accent"}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.632-8.664 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
          </svg>
        </div>

        <div className="text-center max-w-md">
          <p className={`text-text-primary ${titleClass}`}>
            {dragging
              ? t("queue.dropHere")
              : webMultipart
                ? t("queue.dropPromptWeb")
                : t("queue.dropPrompt")}
          </p>
          <p className={`text-muted ${hintClass}`}>
            {webMultipart ? t("queue.dropHintWeb") : t("queue.dropHint")}
          </p>
          {disabled && disabledReason && (
            <p
              className={`text-warning max-w-md mx-auto font-medium leading-snug ${compact ? "text-xs mt-2" : "text-sm mt-3"}`}
              role="status"
            >
              {disabledReason}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
