import type { RefObject } from "react";
import type { Virtualizer } from "@tanstack/react-virtual";
import type { FileEntry } from "../../api";
import FileCard from "../FileCard";
import SkeletonCard from "../SkeletonCard";
import { useI18n } from "../../i18n/I18nContext";
import { formatIntegerApostropheThousands } from "../../utils/format";

interface QueueVirtualizedFileListProps {
  isRunning: boolean;
  totalCount: number;
  sortedFileCount: number;
  failedFiles: FileEntry[];
  /** Gmail attachment fetch failures (not pipeline error rows). */
  fetchFailureCount: number;
  hasAiTouchedFile: boolean;
  files: FileEntry[];
  listParentRef: RefObject<HTMLDivElement | null>;
  rowVirtualizer: Virtualizer<HTMLDivElement, Element>;
  onUndoEntry: (entryId: string) => Promise<void>;
  onReassignFile: (file: FileEntry) => void;
}

/**
 * Status chips + virtualized {@link FileCard} list for the active job.
 */
export function QueueVirtualizedFileList({
  isRunning,
  totalCount,
  sortedFileCount,
  failedFiles,
  fetchFailureCount,
  hasAiTouchedFile,
  files,
  listParentRef,
  rowVirtualizer,
  onUndoEntry,
  onReassignFile,
}: QueueVirtualizedFileListProps) {
  const { t } = useI18n();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end gap-1.5 flex-wrap px-1">
        {[
          {
            key: "sorted",
            label: t("queue.chipSorted", {
              count: formatIntegerApostropheThousands(sortedFileCount),
            }),
            show: sortedFileCount > 0,
            cls: "bg-success-soft text-success",
          },
          {
            key: "failed_sort",
            label: t("queue.chipFailedSort", {
              count: formatIntegerApostropheThousands(failedFiles.length),
            }),
            show: failedFiles.length > 0,
            cls: "bg-error-soft text-error",
          },
          {
            key: "failed_fetch",
            label: t("queue.chipFailedFetch", {
              count: formatIntegerApostropheThousands(fetchFailureCount),
            }),
            show: fetchFailureCount > 0,
            cls: "bg-error-soft text-error",
          },
          {
            key: "pending",
            label: t("queue.chipTotal", {
              count: formatIntegerApostropheThousands(totalCount),
            }),
            show:
              !isRunning &&
              !hasAiTouchedFile &&
              failedFiles.length === 0 &&
              fetchFailureCount === 0,
            cls: "bg-surface-subtle text-muted",
          },
        ]
          .filter((c) => c.show)
          .map((c) => (
            <span key={c.key} className={`text-2xs font-semibold px-2 py-0.5 rounded-full ${c.cls}`}>
              {c.label}
            </span>
          ))}
      </div>

      <div
        ref={listParentRef}
        className="overflow-y-auto max-h-[480px] pr-0.5 space-y-0"
        style={{ contain: "strict" }}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const file = files[virtualRow.index];
            return (
              <div
                key={virtualRow.key}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                  paddingBottom: "6px",
                }}
              >
                {file.status === "pending" && isRunning ? (
                  <SkeletonCard />
                ) : (
                  <FileCard
                    file={file}
                    onUndo={onUndoEntry}
                    onReassign={file.status === "done" ? () => onReassignFile(file) : undefined}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
