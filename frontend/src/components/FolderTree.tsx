import { useState } from "react";
import type { FolderNode } from "../api";
import { joinPath } from "../utils/path";

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? "w-4 h-4"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
    </svg>
  );
}

function recursiveFileCount(folder: FolderNode): number {
  return (
    folder.files.length +
    (folder.children ?? []).reduce((sum, child) => sum + recursiveFileCount(child), 0)
  );
}

interface FolderTreeProps {
  tree: FolderNode[];
  viewMode?: "rows" | "grid";
  onOpenFolder?: (path: string) => void;
  onRevealFile?: (path: string) => void;
}

interface RowsBranchProps {
  folder: FolderNode;
  depth: number;
  expanded: Set<string>;
  togglePath: (path: string) => void;
  onOpenFolder?: (path: string) => void;
  onRevealFile?: (path: string) => void;
}

function FolderRowsBranch({
  folder,
  depth,
  expanded,
  togglePath,
  onOpenFolder,
  onRevealFile,
}: RowsBranchProps) {
  const isOpen = expanded.has(folder.path);
  const hasChildren = (folder.children?.length ?? 0) > 0;
  const totalFiles = recursiveFileCount(folder);
  const showChevron = folder.files.length > 0 || hasChildren;

  return (
    <div className={depth > 0 ? "pl-3 border-l border-border-soft ml-1.5 space-y-1.5" : "space-y-1.5"}>
      <div className="rounded-xl overflow-hidden border border-border bg-bg-card">
        <div
          role="button"
          tabIndex={0}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-hover-overlay transition-colors cursor-pointer select-none"
          onClick={() => (showChevron ? togglePath(folder.path) : undefined)}
          onKeyDown={(e) => {
            if (!showChevron) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              togglePath(folder.path);
            }
          }}
        >
          {showChevron ? (
            <svg
              className={`w-4 h-4 text-muted transition-transform shrink-0 ${isOpen ? "rotate-90" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          ) : (
            <span className="w-4 shrink-0" aria-hidden />
          )}

          <span className="text-lg shrink-0">📁</span>

          <span className="flex-1 font-medium text-sm text-text-primary truncate min-w-0">{folder.name}</span>

          <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full bg-accent-light text-accent">
            {totalFiles} {totalFiles === 1 ? "file" : "files"}
          </span>

          {onOpenFolder && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenFolder(folder.path);
              }}
              className="shrink-0 p-1 rounded hover:bg-hover-strong text-muted hover:text-text-primary transition-colors"
              title="Open in Explorer"
            >
              <ExternalLinkIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {isOpen && (
          <div className="border-t border-border bg-bg-secondary divide-y divide-border-soft">
            {folder.files.length === 0 && !hasChildren ? (
              <p className="px-4 py-2 text-xs text-muted">Empty folder</p>
            ) : null}
            {folder.files.map((fname) => (
              <div key={fname} className="flex items-start gap-2 px-4 py-2 hover:bg-hover-overlay transition-colors">
                <span className="text-sm mt-0.5">📄</span>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-xs truncate ${onRevealFile ? "text-text-primary hover:underline cursor-pointer" : "text-muted"}`}
                    title={onRevealFile ? "Click to reveal file in Finder/Explorer" : fname}
                    onClick={onRevealFile ? () => onRevealFile(joinPath(folder.path, fname)) : undefined}
                  >
                    {fname}
                  </p>
                  <p className="text-2xs text-muted truncate opacity-80" title={joinPath(folder.path, fname)}>
                    {joinPath(folder.path, fname)}
                  </p>
                </div>
                {onRevealFile && (
                  <button
                    type="button"
                    onClick={() => onRevealFile(joinPath(folder.path, fname))}
                    className="shrink-0 p-1 rounded hover:bg-hover-strong text-muted hover:text-text-primary transition-colors"
                    title="Reveal file"
                  >
                    <ExternalLinkIcon className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
            {hasChildren && (
              <div className="px-2 py-2 space-y-1.5">
                {folder.children!.map((child) => (
                  <FolderRowsBranch
                    key={child.path}
                    folder={child}
                    depth={depth + 1}
                    expanded={expanded}
                    togglePath={togglePath}
                    onOpenFolder={onOpenFolder}
                    onRevealFile={onRevealFile}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface GridBranchProps {
  folder: FolderNode;
  onOpenFolder?: (path: string) => void;
  onRevealFile?: (path: string) => void;
}

function FolderGridBranch({ folder, onOpenFolder, onRevealFile }: GridBranchProps) {
  const totalFiles = recursiveFileCount(folder);
  const hasChildren = (folder.children?.length ?? 0) > 0;

  return (
    <div className="rounded-xl overflow-hidden border border-border bg-bg-card p-3 space-y-2">
      <div className="flex items-start gap-2">
        <span className="text-lg shrink-0">📁</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary truncate">{folder.name}</p>
          <p className="text-xs text-muted">
            {totalFiles} {totalFiles === 1 ? "file" : "files"}
            {hasChildren ? " · includes subfolders" : ""}
          </p>
        </div>
        {onOpenFolder && (
          <button
            type="button"
            onClick={() => onOpenFolder(folder.path)}
            className="shrink-0 p-1 rounded hover:bg-hover-strong text-muted hover:text-text-primary transition-colors"
            title="Open folder"
          >
            <ExternalLinkIcon />
          </button>
        )}
      </div>

      {folder.files.length > 0 && (
        <div className="border border-border-mid rounded-lg bg-bg-secondary max-h-36 overflow-auto">
          {folder.files.slice(0, 5).map((fname) => (
            <div key={fname} className="px-2 py-1.5 text-xs text-muted truncate">
              {onRevealFile ? (
                <button
                  type="button"
                  onClick={() => onRevealFile(joinPath(folder.path, fname))}
                  className="truncate text-left hover:underline text-text-primary w-full"
                  title={joinPath(folder.path, fname)}
                >
                  {fname}
                </button>
              ) : (
                fname
              )}
            </div>
          ))}
          {folder.files.length > 5 && (
            <p className="px-2 py-1.5 text-2xs text-muted">+ {folder.files.length - 5} more</p>
          )}
        </div>
      )}

      {hasChildren && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          {folder.children!.map((child) => (
            <FolderGridBranch key={child.path} folder={child} onOpenFolder={onOpenFolder} onRevealFile={onRevealFile} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FolderTree({ tree, viewMode = "rows", onOpenFolder, onRevealFile }: FolderTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const togglePath = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  if (tree.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted">
        <svg className="w-10 h-10 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v8.25m19.5 0v.75A2.25 2.25 0 0 1 19.5 17.25h-15a2.25 2.25 0 0 1-2.25-2.25V13.5"
          />
        </svg>
        <p className="text-sm">No sorted folders yet</p>
      </div>
    );
  }

  if (viewMode === "grid") {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {tree.map((folder) => (
          <FolderGridBranch key={folder.path} folder={folder} onOpenFolder={onOpenFolder} onRevealFile={onRevealFile} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {tree.map((folder) => (
        <FolderRowsBranch
          key={folder.path}
          folder={folder}
          depth={0}
          expanded={expanded}
          togglePath={togglePath}
          onOpenFolder={onOpenFolder}
          onRevealFile={onRevealFile}
        />
      ))}
    </div>
  );
}
