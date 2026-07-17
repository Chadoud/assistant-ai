/**
 * TasksPanel — Tasks hub: day-grouped action items, briefing, sync drawer, meeting modal.
 */

import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";
import { toast } from "sonner";
import MeetingModeModal from "./tasks/MeetingModeModal";
import SyncStatusDrawer from "./tasks/SyncStatusDrawer";
import TaskRow, { type TaskSourceBadge } from "./tasks/TaskRow";
import TodayBriefingCard from "./tasks/TodayBriefingCard";
import TodoInboxSection from "./tasks/TodoInboxSection";
import TodoSubNav from "./tasks/TodoSubNav";
import TodoTaskTimeline, { firstOverdueSectionId, todaySectionId } from "./tasks/TodoTaskTimeline";
import TodoTodaySummary from "./tasks/TodoTodaySummary";
import PanelShell from "./ui/PanelShell";
import OfflineStrip from "./ui/OfflineStrip";
import ProTabBanner from "./ui/ProTabBanner";
import EmptyState from "./ui/EmptyState";
import ListSkeleton from "./ui/ListSkeleton";
import { EntitlementBlockedError } from "../api/client";
import { fetchTasks, fetchTaskOpenTarget, setTaskCompleted, syncTasksFromIntegrations, type Task } from "../api/tasks";
import NoiseCleanupDialog from "./secondBrain/NoiseCleanupDialog";
import { useSecondBrainNoiseCleanup } from "../hooks/useSecondBrainNoiseCleanup";
import { fetchSchedulerStatus } from "../api/proactive";
import { consumeOpenMeetingModal } from "../utils/deferredPanelActions";
import { useOpenTarget } from "../hooks/useOpenTarget";
import { useI18n } from "../i18n/I18nContext";
import { getTodoPanelHeadingKeys } from "../utils/workspacePanelHeadings";
import type { TodoSubTab } from "../utils/todoUi";
import { TODO_SCROLL_SECTION_IDS } from "../utils/todoUi";
import { useScrollSpy } from "../hooks/useScrollSpy";
import type { TodoFeed } from "../hooks/useTodoFeed";
import {
  groupTasksByCompletedDay,
  groupTasksByDueDay,
  groupTasksByUpcomingDay,
  splitTodayTasks,
} from "../utils/taskBuckets";
import { scrollToSectionId } from "../utils/scrollAnchor";
import { taskMayHaveOpenTarget } from "../utils/memoryOrigin";
import { useConversations } from "../hooks/useConversations";
import { queueChatDraft } from "../utils/deferredPanelActions";

interface Props {
  backendOnline: boolean;
  subTab: TodoSubTab;
  /** Parent To Do nav: Tasks, Inbox, and Done on one scrollable page. */
  showAllSections?: boolean;
  scrollRootRef?: RefObject<HTMLElement | null>;
  onScrollSectionReport?: (sectionId: string) => void;
  todoFeed: TodoFeed;
  /** When false, sidebar labels are visible — hide duplicate in-panel sub-nav. */
  sidebarCompact?: boolean;
  onSelectSubTab?: (subTab: TodoSubTab) => void;
  onOpenConversation?: () => void;
  onOpenSources?: () => void;
  onOpenMemoryReview?: () => void;
  proAllowed?: boolean;
  onUpgrade?: () => void;
  onRetryBackend?: () => void | Promise<void>;
}

const SOURCE_TONES: Record<string, string> = {
  conversation: "bg-accent/15 text-accent",
  meeting: "bg-accent/15 text-accent",
  assistant: "bg-accent/15 text-accent",
  gmail: "bg-red-500/15 text-red-400",
  outlook: "bg-sky-500/15 text-sky-400",
  "google-calendar": "bg-emerald-500/15 text-emerald-400",
  "outlook-calendar": "bg-sky-500/15 text-sky-400",
};

const SOURCE_LABEL_KEYS: Record<string, string> = {
  conversation: "tasks.sources.conversation",
  meeting: "tasks.sources.meeting",
  assistant: "tasks.sources.assistant",
  gmail: "tasks.sources.gmail",
  outlook: "tasks.sources.outlook",
  "google-calendar": "tasks.sources.googleCalendar",
  "outlook-calendar": "tasks.sources.outlookCalendar",
};

export default function TasksPanel({
  backendOnline,
  subTab,
  showAllSections = false,
  scrollRootRef,
  onScrollSectionReport,
  todoFeed,
  sidebarCompact = false,
  onSelectSubTab,
  onOpenConversation,
  onOpenSources,
  onOpenMemoryReview,
  proAllowed = true,
  onUpgrade,
  onRetryBackend,
}: Props) {
  const { t } = useI18n();
  useScrollSpy({
    enabled: showAllSections,
    sectionIds: TODO_SCROLL_SECTION_IDS,
    rootRef: scrollRootRef,
    onActiveIdChange: onScrollSectionReport,
  });
  const { openTarget } = useOpenTarget(onOpenConversation);
  const { create: createConversation } = useConversations();
  const retryFailureInChat = useCallback(
    (prompt: string, failureId?: number) => {
      const trimmed = prompt.trim();
      if (!trimmed) return;
      // Leave the open failure card while retrying — upsert/success clears it.
      // Still dismiss optimistically so Inbox doesn't feel like stacked duplicates
      // if the poll lags behind a same-goal re-fail.
      if (typeof failureId === "number") {
        void todoFeed.dismissInboxFailure(failureId);
      }
      // Fresh thread so polluted history / prior demo goals cannot hijack the retry.
      createConversation();
      queueChatDraft(trimmed, "assistant");
      onOpenConversation?.();
    },
    [createConversation, onOpenConversation, todoFeed],
  );
  const showTasks = showAllSections || subTab === "today";
  const showInbox = showAllSections || subTab === "inbox";
  const showDone = showAllSections || subTab === "done";
  const heading = getTodoPanelHeadingKeys(subTab, showAllSections);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [openBusyTaskId, setOpenBusyTaskId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proBlocked, setProBlocked] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncReport, setSyncReport] = useState<{
    created: Record<string, number>;
    statuses?: Record<string, string>;
  } | null>(null);
  const [syncDrawerOpen, setSyncDrawerOpen] = useState(false);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [pendingMeetingOpen, setPendingMeetingOpen] = useState(() => consumeOpenMeetingModal());
  const [laterOpen, setLaterOpen] = useState(false);

  const proLocked = !proAllowed || proBlocked;

  useEffect(() => {
    if (!pendingMeetingOpen || !backendOnline || proLocked) return;
    setPendingMeetingOpen(false);
    setMeetingOpen(true);
  }, [pendingMeetingOpen, backendOnline, proLocked]);

  const sourceBadge = useCallback(
    (source: string): TaskSourceBadge => ({
      label: SOURCE_LABEL_KEYS[source] ? t(SOURCE_LABEL_KEYS[source]) : source.replace(/-/g, " "),
      tone: SOURCE_TONES[source] ?? "bg-bg-primary text-muted",
    }),
    [t],
  );

  const load = useCallback(async () => {
    if (!backendOnline) return;
    setLoading(true);
    setError(null);
    try {
      setTasks(await fetchTasks(true));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("tasks.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [backendOnline, t]);

  const noiseCleanup = useSecondBrainNoiseCleanup({ onSuccess: () => load() });

  const refreshAll = useCallback(async () => {
    if (!backendOnline) return;
    setSyncing(true);
    try {
      const sync = await syncTasksFromIntegrations();
      setSyncReport({ created: sync.created, statuses: sync.statuses });
      setLastSyncAt(new Date().toISOString());
      await load();
      if (sync.total_created > 0) {
        toast.success(
          t(sync.total_created === 1 ? "tasks.toastFoundOne" : "tasks.toastFoundOther", {
            n: sync.total_created,
          }),
        );
      }
    } catch (e) {
      if (e instanceof EntitlementBlockedError) {
        setProBlocked(true);
      } else {
        toast.error(e instanceof Error ? e.message : t("tasks.toastSyncFailed"));
      }
      await load();
    } finally {
      setSyncing(false);
    }
  }, [backendOnline, load, t]);

  useEffect(() => {
    if (!backendOnline) return;
    void load();
    void fetchSchedulerStatus().then((status) => {
      if (!status) return;
      const job = status.jobs.find((j) => j.name === "integration_task_sync");
      if (job?.last_run_at) setLastSyncAt(job.last_run_at);
    });
  }, [backendOnline, load]);

  const todaySplit = useMemo(() => splitTodayTasks(tasks), [tasks]);
  const todayDayGroups = useMemo(() => groupTasksByDueDay(tasks), [tasks]);
  const upcomingDayGroups = useMemo(() => groupTasksByUpcomingDay(tasks), [tasks]);
  const completedDayGroups = useMemo(() => groupTasksByCompletedDay(tasks), [tasks]);
  const somedayTasks = useMemo(
    () => tasks.filter((task) => !task.completed && !task.due_at),
    [tasks],
  );

  const handleToggle = async (task: Task) => {
    try {
      const updated = await setTaskCompleted(task.id, !task.completed);
      setTasks((prev) => prev.map((item) => (item.id === task.id ? updated : item)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("tasks.toastUpdateFailed"));
    }
  };

  const openSource = (task: Task) => {
    if (!taskMayHaveOpenTarget(task)) return;
    setOpenBusyTaskId(task.id);
    void openTarget(() => fetchTaskOpenTarget(task.id)).finally(() => setOpenBusyTaskId(null));
  };

  const renderTaskRow = (task: Task, dueDisplay: "grouped" | "full" | "none") => (
    <TaskRow
      key={task.id}
      task={task}
      sourceBadge={sourceBadge(task.source)}
      dueDisplay={dueDisplay}
      onToggle={(item) => void handleToggle(item)}
      onOpenSource={taskMayHaveOpenTarget(task) ? openSource : undefined}
      openBusy={openBusyTaskId === task.id}
    />
  );

  const scrollToDaySection = (sectionId: string | null) => {
    if (!sectionId) return;
    scrollToSectionId(sectionId, { behavior: "smooth" });
  };

  const todayHasTasks = todaySplit.overdue.length + todaySplit.dueToday.length > 0;
  const hasUpcomingContent = upcomingDayGroups.length > 0 || somedayTasks.length > 0;
  const hasAnyOpenTasks = todayHasTasks || hasUpcomingContent;
  const showSubNav = !proLocked && sidebarCompact && !showAllSections;
  const showSyncAction = !proLocked && (showAllSections || subTab !== "inbox");
  const showMeetingFab = !proLocked && showTasks;

  const sectionHeading = (titleKey: string) =>
    showAllSections ? (
      <h2 className="border-b border-border pb-2 text-base font-semibold text-text-primary">{t(titleKey)}</h2>
    ) : null;

  const renderBriefingCard = () => (
    <div className="mt-6">
      <TodayBriefingCard
        backendOnline={backendOnline}
        proAllowed={proAllowed}
        onUpgrade={onUpgrade}
        hideProCard={proLocked}
      />
    </div>
  );

  const renderUpcomingAndLater = (showDivider: boolean) => {
    if (!hasUpcomingContent) return null;
    return (
      <div
        id="todo-upcoming-section"
        className={showDivider ? "mt-10 space-y-5 border-t border-border pt-10" : "space-y-5"}
      >
        {showDivider ? (
          <h2 className="text-base font-semibold text-text-primary">{t("nav.todoUpcoming")}</h2>
        ) : null}
        <TodoTaskTimeline mode="upcoming" dueGroups={upcomingDayGroups} renderTask={renderTaskRow} />
        {somedayTasks.length > 0 ? (
          <section className="space-y-2">
            <button
              type="button"
              onClick={() => setLaterOpen((value) => !value)}
              className="flex w-full items-center justify-between px-0.5 text-sm font-medium text-muted hover:text-text-primary"
            >
              {t("tasks.laterSection", { n: somedayTasks.length })}
              <svg
                className={`h-4 w-4 transition-transform ${laterOpen ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {laterOpen ? (
              <ul className="space-y-2">{somedayTasks.map((task) => renderTaskRow(task, "none"))}</ul>
            ) : null}
          </section>
        ) : null}
      </div>
    );
  };

  const renderTasksBody = () => {
    if (proLocked) return null;
    if (loading && tasks.length === 0) return <ListSkeleton />;
    if (loading) return null;

    if (!hasAnyOpenTasks) {
      return (
        <EmptyState
          title={t("tasks.emptyTitle")}
          description={t("tasks.emptyDesc")}
          primaryAction={{
            label: t("tasks.syncFromAccounts"),
            onClick: () => void refreshAll(),
          }}
        />
      );
    }

    return (
      <>
        {todayHasTasks ? (
          <TodoTaskTimeline mode="today" dueGroups={todayDayGroups} renderTask={renderTaskRow} />
        ) : null}
        {renderBriefingCard()}
        {renderUpcomingAndLater(todayHasTasks)}
      </>
    );
  };

  const renderDoneBody = () => {
    if (loading && tasks.length === 0) return <ListSkeleton />;
    if (loading) return null;
    return completedDayGroups.length > 0 ? (
      <TodoTaskTimeline mode="completed" completedGroups={completedDayGroups} renderTask={renderTaskRow} />
    ) : (
      <EmptyState title={t("todo.doneEmptyTitle")} description={t("todo.doneEmptyDesc")} />
    );
  };

  return (
    <div className="relative w-full pb-20">
      <PanelShell
        title={t(heading.titleKey)}
        subtitle={t(heading.subtitleKey)}
        actions={
          showSyncAction ? (
            <button
              type="button"
              onClick={() => setSyncDrawerOpen(true)}
              disabled={!backendOnline}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-bg-secondary px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary disabled:opacity-50"
              title={t("tasks.syncDetails")}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
                />
              </svg>
              {t("tasks.syncAccounts")}
            </button>
          ) : undefined
        }
        offlineBanner={
          !backendOnline ? (
            <OfflineStrip
              message={t("tasks.offline")}
              action={
                onRetryBackend
                  ? { label: t("offlineStrip.retryApi"), onClick: onRetryBackend }
                  : undefined
              }
            />
          ) : null
        }
      >
        {proLocked ? (
          <ProTabBanner description={t("pro.tasksFeature")} onUpgrade={() => onUpgrade?.()} />
        ) : null}

        {showSubNav ? (
          <TodoSubNav
            active={subTab}
            onSelect={(next) => onSelectSubTab?.(next)}
            badges={{
              today: todoFeed.counts.today,
              inbox: todoFeed.counts.inbox,
            }}
          />
        ) : null}

        {showAllSections ? (
          <div className="space-y-10">
            {showTasks ? (
              <section id="todo-section-today" className="space-y-4">
                {sectionHeading("nav.todoToday")}
                {!proLocked ? (
                  <TodoTodaySummary
                    overdueCount={todaySplit.overdue.length}
                    dueTodayCount={todaySplit.dueToday.length}
                    inboxCount={todoFeed.counts.inbox}
                    onOpenInbox={() => onSelectSubTab?.("inbox")}
                    onScrollToOverdue={() => scrollToDaySection(firstOverdueSectionId(todayDayGroups))}
                    onScrollToToday={() => scrollToDaySection(todaySectionId(todayDayGroups))}
                  />
                ) : null}
                {error ? (
                  <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
                ) : null}
                {renderTasksBody()}
              </section>
            ) : null}

            {showInbox ? (
              <section id="todo-section-inbox" className="space-y-4 border-t border-border pt-10">
                {sectionHeading("nav.todoInbox")}
                <TodoInboxSection
                  inbox={todoFeed.inbox}
                  onDismissNudge={todoFeed.dismissInboxNudge}
                  onDismissAllNudges={todoFeed.dismissAllInboxNudges}
                  onDismissFailure={todoFeed.dismissInboxFailure}
                  onOpenMemoryReview={() => onOpenMemoryReview?.()}
                  onOpenToday={() => onSelectSubTab?.("today")}
                  onOpenChat={() => onOpenConversation?.()}
                  onRetryFailureInChat={retryFailureInChat}
                />
              </section>
            ) : null}

            {showDone ? (
              <section id="todo-section-done" className="space-y-4 border-t border-border pt-10">
                {sectionHeading("nav.todoDone")}
                {error ? (
                  <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
                ) : null}
                {renderDoneBody()}
              </section>
            ) : null}
          </div>
        ) : (
          <>
            {showInbox ? (
              <TodoInboxSection
                inbox={todoFeed.inbox}
                onDismissNudge={todoFeed.dismissInboxNudge}
                onDismissAllNudges={todoFeed.dismissAllInboxNudges}
                onDismissFailure={todoFeed.dismissInboxFailure}
                onOpenMemoryReview={() => onOpenMemoryReview?.()}
                onOpenToday={() => onSelectSubTab?.("today")}
                onOpenChat={() => onOpenConversation?.()}
                onRetryFailureInChat={retryFailureInChat}
              />
            ) : null}

            {!proLocked && showTasks ? (
              <TodoTodaySummary
                overdueCount={todaySplit.overdue.length}
                dueTodayCount={todaySplit.dueToday.length}
                inboxCount={todoFeed.counts.inbox}
                onOpenInbox={() => onSelectSubTab?.("inbox")}
                onScrollToOverdue={() => scrollToDaySection(firstOverdueSectionId(todayDayGroups))}
                onScrollToToday={() => scrollToDaySection(todaySectionId(todayDayGroups))}
              />
            ) : null}

            {!showInbox && error ? (
              <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
            ) : null}

            {showTasks ? renderTasksBody() : showDone && !loading ? renderDoneBody() : null}
          </>
        )}
      </PanelShell>

      {showMeetingFab ? (
        <button
          type="button"
          onClick={() => setMeetingOpen(true)}
          disabled={!backendOnline}
          className="fixed bottom-6 right-6 z-20 mb-[env(safe-area-inset-bottom)] mr-[env(safe-area-inset-right)] inline-flex max-w-[calc(100vw-3rem)] items-center gap-2 rounded-full bg-button-primary px-4 py-3 text-sm font-medium text-white shadow-lg hover:bg-button-hover disabled:opacity-50 max-[1024px]:bottom-20"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 18.75a6.75 6.75 0 0 0 6.75-6.75v-1.5m-6.75 7.5a6.75 6.75 0 0 1-6.75-6.75v-1.5m6.75 7.5v3.75m-3.75-3.75h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 0 1 6 0v8.25a3 3 0 0 1-3 3Z"
            />
          </svg>
          {t("tasks.recordMeeting")}
        </button>
      ) : null}

      <SyncStatusDrawer
        open={syncDrawerOpen}
        onClose={() => setSyncDrawerOpen(false)}
        lastSyncAt={lastSyncAt}
        syncReport={syncReport}
        onOpenSources={onOpenSources}
        onSync={() => void refreshAll()}
        syncing={syncing}
        onDiscardPromotional={() => void noiseCleanup.openDialog()}
      />

      <NoiseCleanupDialog
        open={noiseCleanup.dialogOpen}
        preview={noiseCleanup.preview}
        isPreviewing={noiseCleanup.isPreviewing}
        isRunning={noiseCleanup.isRunning}
        onClose={noiseCleanup.closeDialog}
        onConfirm={() => void noiseCleanup.execute()}
      />

      <MeetingModeModal
        open={meetingOpen}
        onClose={() => setMeetingOpen(false)}
        backendOnline={backendOnline}
        onMeetingEnded={() => void load()}
        onOpenConversation={onOpenConversation}
        proAllowed={proAllowed}
        onUpgrade={onUpgrade}
      />
    </div>
  );
}
