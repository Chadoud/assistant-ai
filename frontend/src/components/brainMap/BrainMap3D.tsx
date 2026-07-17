/**
 * BrainMap3D — navigable 3D map of the second brain.
 *
 * Memories, conversations, tasks, AND sorted files on disk — the piece Omi
 * does not have, but a file-manager second brain must.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { fetchBrainFiles, type BrainFolder } from "../../api/brain";
import { fetchAllScopedMemory, fetchMemoryOpenTarget, type ScopedMemoryEntry } from "../../api/memory";
import { listStoredConversations, type ConversationSummary } from "../../api/conversationsStore";
import { fetchTaskOpenTarget, fetchTasks, type Task } from "../../api/tasks";
import { track } from "../../telemetry/client";
import { TelemetryEventNames } from "../../telemetry/schema";
import { queueHighlightMemory, queueTodoSubTab } from "../../utils/deferredPanelActions";
import { useConversations } from "../../hooks/useConversations";
import { useOpenTarget } from "../../hooks/useOpenTarget";
import { useI18n } from "../../i18n/I18nContext";
import { isPromptVisibleMemory } from "../../utils/memoryUi";
import BrainMapDetailCard, { type BrainMapDetailAction } from "./BrainMapDetailCard";
import { readBrainMapPrefs } from "./brainMapSettings";
import { BrainMapScene } from "./BrainMapScene";
import BrainMapHoverCard from "./BrainMapHoverCard";
import {
  buildBrainGraph,
  CATEGORY_COLORS,
  isMapHubNode,
  type BrainGraphLabels,
  type BrainNode,
  type BrainNodeKind,
} from "./graphModel";

interface Props {
  backendOnline: boolean;
  onOpenConversation?: () => void;
  onOpenTodo?: () => void;
  onHighlightMemory?: (memoryId: number) => void;
  className?: string;
  searchQuery?: string;
}

const KIND_FILTER_OPTIONS: BrainNodeKind[] = [
  "file",
  "memory",
  "conversation",
  "task",
];

function colorHex(value: number): string {
  return `#${value.toString(16).padStart(6, "0")}`;
}

export default function BrainMap3D({
  backendOnline,
  onOpenConversation,
  onOpenTodo,
  onHighlightMemory,
  className,
  searchQuery = "",
}: Props) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<BrainMapScene | null>(null);
  const { setActive } = useConversations();
  const { openTarget } = useOpenTarget(onOpenConversation);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [kindFilter, setKindFilter] = useState<BrainNodeKind[]>([]);
  const [hubOnlyView, setHubOnlyView] = useState(true);
  const [sourceBusy, setSourceBusy] = useState(false);
  const telemetryRef = useRef(readBrainMapPrefs());

  const kindBadge = (kind: BrainNode["kind"]) => t(`brainMap.kinds.${kind}`);

  const [counts, setCounts] = useState({
    memories: 0,
    conversations: 0,
    tasks: 0,
    files: 0,
    folders: 0,
  });
  const [loading, setLoading] = useState(true);
  const [isEmpty, setIsEmpty] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hover, setHover] = useState<{ node: BrainNode; x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<BrainNode | null>(null);

  const loadData = useCallback(async (): Promise<{
    memories: ScopedMemoryEntry[];
    conversations: ConversationSummary[];
    tasks: Task[];
    fileFolders: BrainFolder[];
    errors: string[];
  }> => {
    const errors: string[] = [];
    const prefs = readBrainMapPrefs();
    telemetryRef.current = prefs;
    const [memoriesResult, conversationsResult, tasksResult, filesResult] = await Promise.allSettled([
      fetchAllScopedMemory(),
      listStoredConversations(80, {
        mapEligible: true,
        includeLowValue: prefs.brainMapIncludeLowValueChats === true,
      }),
      fetchTasks(false, {
        excludeManual: false,
        mapEligible: !prefs.brainMapIncludeMailTasks,
      }),
      fetchBrainFiles(),
    ]);

    const memories =
      memoriesResult.status === "fulfilled"
        ? memoriesResult.value
        : (errors.push("memories"), [] as ScopedMemoryEntry[]);
    const conversations =
      conversationsResult.status === "fulfilled"
        ? conversationsResult.value
        : (errors.push("conversations"), [] as ConversationSummary[]);
    const tasks =
      tasksResult.status === "fulfilled" ? tasksResult.value : (errors.push("tasks"), [] as Task[]);
    const filesResp =
      filesResult.status === "fulfilled"
        ? filesResult.value
        : (errors.push("files"), { folders: [], folder_count: 0, file_count: 0 });

    const globalMemories = memories.filter(
      (m) => (m.conversation_id === null || m.reviewed) && isPromptVisibleMemory(m),
    );
    return {
      memories: globalMemories,
      conversations,
      tasks,
      fileFolders: filesResp.folders,
      errors,
    };
  }, []);

  const graphLabels = useCallback(
    (): BrainGraphLabels => ({
      you: t("brainMap.graph.you"),
      rootDetail: t("brainMap.graph.rootDetail"),
      yourFiles: t("brainMap.graph.yourFiles"),
      filesDetail: t("brainMap.graph.filesDetail"),
      tasks: t("brainMap.graph.tasks"),
      tasksDetail: t("brainMap.graph.tasksDetail"),
      conversations: t("brainMap.graph.conversations"),
      conversationsDetail: t("brainMap.graph.conversationsDetail"),
      untitledConversation: t("brainMap.graph.untitledConversation"),
      noSummary: t("brainMap.graph.noSummary"),
      category: (label) => t("memories.categories." + label),
      categoryDetail: (label) =>
        t("brainMap.graph.categoryDetail", { category: t("memories.categories." + label) }),
      filesInFolder: (n) =>
        t(n === 1 ? "brainMap.graph.filesInFolderOne" : "brainMap.graph.filesInFolderOther", { n }),
      hoverMoreItems: (n) => t("brainMap.graph.hoverMoreItems", { n }),
      memoriesInCategory: (n) =>
        t(n === 1 ? "brainMap.graph.memoriesInCategoryOne" : "brainMap.graph.memoriesInCategoryOther", {
          n,
        }),
      filesInHub: (fileCount, folderCount) =>
        t(
          folderCount === 1
            ? "brainMap.graph.filesInHubOneFolder"
            : "brainMap.graph.filesInHubOtherFolders",
          { fileCount, folderCount },
        ),
      openTasksInHub: (n) =>
        t(n === 1 ? "brainMap.graph.openTasksInHubOne" : "brainMap.graph.openTasksInHubOther", { n }),
      conversationsLinked: (n) =>
        t(n === 1 ? "brainMap.graph.conversationsLinkedOne" : "brainMap.graph.conversationsLinkedOther", {
          n,
        }),
      fileInFolder: (folderName) => t("brainMap.graph.fileInFolder", { folder: folderName }),
    }),
    [t],
  );

  const trackMapEvent = useCallback(
    (name: (typeof TelemetryEventNames)[keyof typeof TelemetryEventNames], selection: string) => {
      const prefs = telemetryRef.current;
      track(prefs.telemetryOptIn, prefs.uiLocale, name, {
        feature: "brain_map",
        selection,
      });
    },
    [],
  );

  const mountGraph = useCallback(
    (container: HTMLDivElement, data: Awaited<ReturnType<typeof loadData>>) => {
      const graph = buildBrainGraph(data, graphLabels());
      sceneRef.current?.dispose();
      sceneRef.current = new BrainMapScene(container, graph, {
        onHover: (node, x, y) => setHover(node ? { node, x, y } : null),
        onSelect: (node) => {
          setSelected(node);
          if (node) {
            trackMapEvent(TelemetryEventNames.brainMapNodeClicked, node.kind);
            if (isMapHubNode(node)) {
              sceneRef.current?.expandHub(node.id);
            }
            sceneRef.current?.focusNode(node.id);
          }
        },
      });
      sceneRef.current.setHubOnlyView(hubOnlyView);
    },
    [graphLabels, hubOnlyView, trackMapEvent],
  );

  useEffect(() => {
    if (!backendOnline || !containerRef.current) return;
    const container = containerRef.current;
    let cancelled = false;

    void loadData().then((data) => {
      if (cancelled) return;
      setLoading(false);
      setLoadError(
        data.errors.length > 0
          ? t("brainMap.partialLoad", { errors: data.errors.join(", ") })
          : null,
      );
      const fileCount = data.fileFolders.reduce((n, f) => n + f.files.length, 0);
      setCounts({
        memories: data.memories.length,
        conversations: data.conversations.length,
        tasks: data.tasks.filter((t) => !t.completed).length,
        files: fileCount,
        folders: data.fileFolders.length,
      });
      const empty =
        data.memories.length === 0 &&
        data.conversations.length === 0 &&
        data.tasks.length === 0 &&
        fileCount === 0;
      setIsEmpty(empty);
      if (empty) {
        trackMapEvent(TelemetryEventNames.brainMapEmptyState, "empty");
        return;
      }
      mountGraph(container, data);
    });

    return () => {
      cancelled = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [backendOnline, loadData, mountGraph, t, trackMapEvent]);

  useEffect(() => {
    sceneRef.current?.setSearchQuery(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    sceneRef.current?.setKindFilter(kindFilter.length > 0 ? kindFilter : null);
  }, [kindFilter]);

  useEffect(() => {
    sceneRef.current?.setHubOnlyView(hubOnlyView);
  }, [hubOnlyView]);

  const toggleKindFilter = (kind: BrainNodeKind) => {
    setKindFilter((prev) =>
      prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind],
    );
  };

  const openLocalPath = async (targetPath: string): Promise<boolean> => {
    const open = window.electronAPI?.openPath;
    if (!open) {
      toast.error(t("brainMap.openFileUnavailable"));
      return false;
    }
    const err = await open(targetPath);
    if (err) {
      toast.error(t("brainMap.openFileFailed"));
      return false;
    }
    return true;
  };

  const openConversation = (conversationId: string) => {
    setActive(conversationId);
    onOpenConversation?.();
    trackMapEvent(TelemetryEventNames.brainMapSourceOpened, "conversation");
  };

  const openFile = async (filePath: string) => {
    if (await openLocalPath(filePath)) {
      trackMapEvent(TelemetryEventNames.brainMapSourceOpened, "file");
    }
  };

  const openSortedFolder = async (folderName: string) => {
    const { outputDir } = readBrainMapPrefs();
    const base = outputDir.trim();
    if (!base) {
      toast.error(t("brainMap.openFolderNoOutputDir"));
      return;
    }
    const segments = folderName.split(/[/\\]+/).filter(Boolean);
    const folderPath = [base.replace(/[/\\]+$/, ""), ...segments].join("/");
    if (await openLocalPath(folderPath)) {
      trackMapEvent(TelemetryEventNames.brainMapSourceOpened, "folder");
    }
  };

  const handleTaskSource = async (taskId: number) => {
    setSourceBusy(true);
    try {
      const target = await fetchTaskOpenTarget(taskId);
      if (target.url || target.conversation_id) {
        await openTarget(() => Promise.resolve(target));
        trackMapEvent(TelemetryEventNames.brainMapSourceOpened, "task");
        return;
      }
      queueTodoSubTab("inbox");
      onOpenTodo?.();
      trackMapEvent(TelemetryEventNames.brainMapSourceOpened, "todo_fallback");
    } catch {
      queueTodoSubTab("inbox");
      onOpenTodo?.();
      trackMapEvent(TelemetryEventNames.brainMapSourceOpened, "todo_fallback");
    } finally {
      setSourceBusy(false);
    }
  };

  const primaryAction = useCallback((): BrainMapDetailAction | null => {
    if (!selected) return null;
    if (selected.taskId != null) {
      return {
        label: t("brainMap.goToSource"),
        onClick: () => void handleTaskSource(selected.taskId!),
      };
    }
    if (selected.memoryId != null) {
      return {
        label: t("brainMap.openInMemories"),
        onClick: () => {
          void (async () => {
            setSourceBusy(true);
            try {
              const target = await fetchMemoryOpenTarget(selected.memoryId!);
              if (target.url || target.conversation_id) {
                await openTarget(() => Promise.resolve(target));
                trackMapEvent(TelemetryEventNames.brainMapSourceOpened, "memory_external");
                return;
              }
            } catch {
              /* fall through to overview highlight */
            } finally {
              setSourceBusy(false);
            }
            queueHighlightMemory(selected.memoryId!);
            onHighlightMemory?.(selected.memoryId!);
            trackMapEvent(TelemetryEventNames.brainMapSourceOpened, "memory_overview");
          })();
        },
      };
    }
    if (selected.filePath) {
      return {
        label: t("brainMap.openFile"),
        onClick: () => void openFile(selected.filePath!),
      };
    }
    if (selected.conversationId && selected.kind === "conversation") {
      return {
        label: t("brainMap.openConversation"),
        onClick: () => openConversation(selected.conversationId!),
      };
    }
    if (selected.kind === "folder" && selected.folderName) {
      return {
        label: t("brainMap.openSortedFolder"),
        onClick: () => void openSortedFolder(selected.folderName!),
      };
    }
    if (selected.kind === "task") {
      return {
        label: t("brainMap.openInTodo"),
        helperText: t("brainMap.manualTaskHint"),
        onClick: () => {
          queueTodoSubTab("inbox");
          onOpenTodo?.();
          trackMapEvent(TelemetryEventNames.brainMapSourceOpened, "todo");
        },
      };
    }
    return null;
  }, [onHighlightMemory, onOpenTodo, openTarget, selected, t, trackMapEvent]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading, isEmpty]);

  const resetLayout = useCallback(() => {
    sceneRef.current?.resetUserLayout();
    toast.success(t("brainMap.resetLayoutDone"));
  }, [t]);

  const handleRefresh = async () => {
    if (!containerRef.current) return;
    try {
      const data = await loadData();
      setLoadError(
        data.errors.length > 0
          ? t("brainMap.partialLoad", { errors: data.errors.join(", ") })
          : null,
      );
      const fileCount = data.fileFolders.reduce((n, f) => n + f.files.length, 0);
      setCounts({
        memories: data.memories.length,
        conversations: data.conversations.length,
        tasks: data.tasks.filter((t) => !t.completed).length,
        files: fileCount,
        folders: data.fileFolders.length,
      });
      setSelected(null);
      setHover(null);
      if (
        fileCount === 0 &&
        data.memories.length === 0 &&
        data.conversations.length === 0 &&
        data.tasks.length === 0
      ) {
        setIsEmpty(true);
        sceneRef.current?.dispose();
        sceneRef.current = null;
        return;
      }
      setIsEmpty(false);
      mountGraph(containerRef.current, data);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : t("brainMap.refreshFailed"));
    }
  };

  if (!backendOnline) {
    return (
      <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-500">
        {t("brainMap.backendOffline")}
      </p>
    );
  }

  const showHoverCard =
    hover !== null &&
    containerSize.width > 0 &&
    (selected === null || hover.node.id !== selected.id);

  return (
    <div
      className={
        className ??
        "relative h-[32rem] overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-bg-secondary/70 to-bg-secondary/30"
      }
    >
      <div ref={containerRef} className="absolute inset-0" />

      {loadError && (
        <div className="pointer-events-none absolute left-3 right-3 top-12 rounded-lg bg-amber-500/15 px-3 py-2 text-xs text-amber-400 backdrop-blur">
          {loadError}
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-sm text-muted">{t("brainMap.loading")}</p>
        </div>
      )}

      {!loading && isEmpty && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-center">
          <p className="text-sm font-medium text-text-primary">{t("brainMap.emptyTitle")}</p>
          <p className="max-w-md text-xs leading-relaxed text-muted">{t("brainMap.emptyDesc")}</p>
        </div>
      )}

      {!loading && !isEmpty && (
        <>
          <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
            {[
              { label: t("brainMap.statFiles"), value: counts.files },
              { label: t("brainMap.statMemories"), value: counts.memories },
              { label: t("brainMap.statConversations"), value: counts.conversations },
              { label: t("brainMap.statTasks"), value: counts.tasks },
            ].map((stat) => (
              <span
                key={stat.label}
                className="rounded-full border border-border bg-bg-primary/80 px-2.5 py-1 text-[11px] text-text-secondary backdrop-blur"
              >
                <span className="font-semibold text-text-primary">{stat.value}</span> {stat.label}
              </span>
            ))}
          </div>

          <div className="pointer-events-auto absolute left-3 top-12 flex flex-wrap items-center gap-1.5">
            {KIND_FILTER_OPTIONS.map((kind) => {
              const active = kindFilter.includes(kind);
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => toggleKindFilter(kind)}
                  className={`rounded-full border px-2.5 py-1 text-[10px] font-medium backdrop-blur transition-colors ${
                    active
                      ? "border-accent bg-accent/20 text-text-primary"
                      : "border-border bg-bg-primary/80 text-muted hover:text-text-secondary"
                  }`}
                >
                  {t(`brainMap.kinds.${kind}`)}
                </button>
              );
            })}
          </div>

          <div className="pointer-events-none absolute bottom-3 left-3 hidden flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-bg-primary/80 px-3 py-2 backdrop-blur sm:flex">
            <span className="inline-flex items-center gap-1.5 text-[10px] text-muted">
              <span className="h-2 w-2 rounded-full bg-brand-tertiary" />
              {t("brainMap.legendYourFiles")}
            </span>
            {Object.entries(CATEGORY_COLORS).slice(0, 4).map(([category, color]) => (
              <span key={category} className="inline-flex items-center gap-1.5 text-[10px] text-muted">
                <span className="h-2 w-2 rounded-full" style={{ background: colorHex(color) }} />
                {t("memories.categories." + category)}
              </span>
            ))}
            <span className="text-[10px] text-muted">…</span>
          </div>

          <p className="pointer-events-none absolute bottom-3 right-3 hidden rounded-lg bg-bg-primary/70 px-2 py-1 text-[10px] text-muted backdrop-blur md:block">
            {t("brainMap.controlsHint")}
          </p>

          <div className="pointer-events-none absolute right-3 top-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-col items-end gap-2">
            <div
              className="pointer-events-auto flex flex-wrap items-center justify-end gap-1.5"
              role="toolbar"
              aria-label={t("brainMap.toolbarAria")}
            >
              <div className="flex items-center gap-1.5 rounded-lg border border-border/80 bg-bg-primary/85 p-1 backdrop-blur">
                <button
                  type="button"
                  onClick={() => {
                    setHubOnlyView(true);
                    sceneRef.current?.setHubOnlyView(true);
                  }}
                  className={`inline-flex items-center rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                    hubOnlyView
                      ? "bg-accent/20 text-text-primary"
                      : "text-muted hover:bg-hover-overlay hover:text-text-secondary"
                  }`}
                  title={t("brainMap.viewHubsTitle")}
                >
                  {t("brainMap.viewHubs")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setHubOnlyView(false);
                    sceneRef.current?.setHubOnlyView(false);
                  }}
                  className={`inline-flex items-center rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                    !hubOnlyView
                      ? "bg-accent/20 text-text-primary"
                      : "text-muted hover:bg-hover-overlay hover:text-text-secondary"
                  }`}
                  title={t("brainMap.viewAllTitle")}
                >
                  {t("brainMap.viewAll")}
                </button>
              </div>

              <div className="flex items-center gap-1.5 rounded-lg border border-border/80 bg-bg-primary/85 p-1 backdrop-blur">
                <button
                  type="button"
                  onClick={resetLayout}
                  className="inline-flex items-center gap-1.5 rounded-md border border-transparent px-2.5 py-1.5 text-[11px] font-medium text-text-secondary transition-colors hover:border-border hover:bg-hover-overlay hover:text-text-primary"
                  title={t("brainMap.resetLayoutTitle")}
                  aria-label={t("brainMap.resetLayoutTitle")}
                >
                  <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H8"
                    />
                  </svg>
                  {t("brainMap.resetLayout")}
                </button>
                <button
                  type="button"
                  onClick={() => void handleRefresh()}
                  className="inline-flex items-center gap-1.5 rounded-md border border-transparent px-2.5 py-1.5 text-[11px] font-medium text-text-secondary transition-colors hover:border-border hover:bg-hover-overlay hover:text-text-primary"
                  title={t("brainMap.refreshTitle")}
                >
                  <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
                    />
                  </svg>
                  {t("brainMap.refresh")}
                </button>
              </div>
            </div>

            {selected ? (
              <div className="pointer-events-auto">
                <BrainMapDetailCard
                  node={selected}
                  kindLabel={kindBadge(selected.kind)}
                  colorHex={colorHex(selected.color)}
                  busy={sourceBusy}
                  closeLabel={t("brainMap.closeAria")}
                  openingLabel={t("brainMap.openingSource")}
                  onClose={() => setSelected(null)}
                  primaryAction={primaryAction()}
                />
              </div>
            ) : null}
          </div>
        </>
      )}

      {showHoverCard && (
        <BrainMapHoverCard
          node={hover.node}
          pointerX={hover.x}
          pointerY={hover.y}
          containerWidth={containerSize.width}
          containerHeight={containerSize.height}
          reservedRight={selected ? 280 : 0}
          kindLabel={kindBadge(hover.node.kind)}
          colorHex={colorHex(hover.node.color)}
          moreItemsLabel={(n) => t("brainMap.graph.hoverMoreItems", { n })}
          clickHint={t("brainMap.hoverClickHint")}
        />
      )}
    </div>
  );
}
