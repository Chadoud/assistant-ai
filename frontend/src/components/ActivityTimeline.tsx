/**
 * ActivityTimeline — opt-in screen-activity capture controls + the distilled
 * timeline (Rewind-lite).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  clearActivityTimeline,
  fetchActivityStatus,
  fetchActivityTimeline,
  pauseActivityCapture,
  resumeActivityCapture,
  setActivityExclusions,
  startActivityCapture,
  stopActivityCapture,
  type ActivityEntry,
  type ActivityStatus,
} from "../api/activity";
import { useI18n } from "../i18n/I18nContext";
import { EntitlementBlockedError } from "../api/client";
import { consumeStartActivityCapture } from "../utils/deferredPanelActions";
import { CARD_SHELL_CLASS } from "../utils/styles";
import EmptyState from "./ui/EmptyState";
import ListSkeleton from "./ui/ListSkeleton";
import ProUpgradeCard from "./ProUpgradeCard";

interface Props {
  backendOnline: boolean;
  proAllowed?: boolean;
  onUpgrade?: () => void;
  hideProCard?: boolean;
}

function formatClockTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function formatDayHeading(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function isBrokenWindowTitle(title: string | null | undefined): boolean {
  const text = (title || "").trim();
  return !text || text.includes("<built-in method") || text.includes("<bound method");
}

function entryContextLabel(entry: ActivityEntry): string | null {
  const app = entry.app.trim();
  const title = isBrokenWindowTitle(entry.title) ? "" : entry.title.trim();
  if (app && title) return `${app} · ${title}`;
  return app || title || null;
}

export default function ActivityTimeline({
  backendOnline,
  proAllowed = true,
  onUpgrade,
  hideProCard = false,
}: Props) {
  const { t } = useI18n();
  const [status, setStatus] = useState<ActivityStatus | null>(null);
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exclusionsDraft, setExclusionsDraft] = useState("");
  const [showExclusions, setShowExclusions] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [proBlocked, setProBlocked] = useState(false);
  const [pendingAutoStart, setPendingAutoStart] = useState(() => consumeStartActivityCapture());
  const proLocked = !proAllowed || proBlocked;

  const refresh = useCallback(async () => {
    if (!backendOnline) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [s, list] = await Promise.all([fetchActivityStatus(), fetchActivityTimeline(200)]);
      setStatus(s);
      setEntries(list);
      setExclusionsDraft(s.exclusions.join(", "));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : t("activity.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [backendOnline, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!pendingAutoStart || !backendOnline || proLocked) return;
    setPendingAutoStart(false);
    void startActivityCapture()
      .then(setStatus)
      .catch((e) => {
        if (e instanceof EntitlementBlockedError) {
          setProBlocked(true);
        } else {
          toast.error(e instanceof Error ? e.message : t("activity.toastCaptureStateFailed"));
        }
      });
  }, [pendingAutoStart, backendOnline, proLocked, t]);

  useEffect(() => {
    if (!status?.running || status.paused) return;
    const handle = setInterval(() => {
      void fetchActivityTimeline(200)
        .then(setEntries)
        .catch(() => {});
      void fetchActivityStatus()
        .then(setStatus)
        .catch(() => {});
    }, 30000);
    return () => clearInterval(handle);
  }, [status?.running, status?.paused]);

  const toggleCapture = async () => {
    try {
      const next = status?.running ? await stopActivityCapture() : await startActivityCapture();
      setStatus(next);
    } catch (e) {
      if (e instanceof EntitlementBlockedError) {
        setProBlocked(true);
      } else {
        toast.error(e instanceof Error ? e.message : t("activity.toastCaptureStateFailed"));
      }
    }
  };

  const handlePauseResume = async () => {
    try {
      const next = status?.paused ? await resumeActivityCapture() : await pauseActivityCapture(60);
      setStatus(next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("activity.toastPauseFailed"));
    }
  };

  const saveExclusions = async () => {
    const terms = exclusionsDraft
      .split(",")
      .map((term) => term.trim())
      .filter(Boolean);
    try {
      const next = await setActivityExclusions(terms);
      setStatus(next);
      toast.success(t("activity.toastExclusionsUpdated"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("activity.toastExclusionsFailed"));
    }
  };

  const handleClear = async () => {
    try {
      await clearActivityTimeline();
      setEntries([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("activity.toastClearFailed"));
    }
  };

  const recording = status?.running && !status?.paused;

  const statusLabel = recording
    ? t("activity.recording")
    : status?.paused
      ? t("activity.paused")
      : t("activity.captureOff");

  const grouped = useMemo(() => {
    const out: { day: string; items: ActivityEntry[] }[] = [];
    for (const entry of entries) {
      const day = formatDayHeading(entry.captured_at);
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(entry);
      else out.push({ day, items: [entry] });
    }
    return out;
  }, [entries]);

  const captureMeta = t("activity.captureSummary", {
    interval: status?.interval_sec ?? 90,
    retention: status?.retention_days ?? 14,
  });

  return (
    <div className="space-y-6">
      {loadError ? (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{loadError}</p>
      ) : null}

      <section className={`${CARD_SHELL_CLASS} overflow-hidden`}>
        <div className="flex flex-wrap items-center gap-4 px-4 py-4 sm:px-5">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span className="relative mt-1 flex h-3 w-3 shrink-0" aria-hidden>
              {recording ? (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-60" />
              ) : null}
              <span
                className={`relative inline-flex h-3 w-3 rounded-full ${
                  recording ? "bg-red-500" : status?.paused ? "bg-amber-400" : "bg-muted"
                }`}
              />
            </span>
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-semibold text-text-primary">{statusLabel}</p>
              <p className="text-xs text-muted">{captureMeta}</p>
              {status?.captured_count ? (
                <p className="text-xs text-muted">
                  {t("activity.capturedCount", { n: status.captured_count })}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {status?.running ? (
              <button
                type="button"
                onClick={() => void handlePauseResume()}
                className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary"
              >
                {status.paused ? t("activity.resume") : t("activity.pause1h")}
              </button>
            ) : null}
            {(status?.running || !proLocked) && (
              <button
                type="button"
                onClick={() => void toggleCapture()}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
                  status?.running ? "bg-red-500 hover:bg-red-500/90" : "bg-button-primary hover:bg-button-hover"
                }`}
              >
                {status?.running ? t("activity.stop") : t("activity.startCapture")}
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border bg-bg-secondary/40 px-4 py-2.5 text-xs sm:px-5">
          <button
            type="button"
            onClick={() => setShowHowItWorks((value) => !value)}
            className="font-medium text-accent hover:underline"
          >
            {showHowItWorks ? t("activity.hideHowItWorks") : t("activity.showHowItWorks")}
          </button>
          <button
            type="button"
            onClick={() => setShowExclusions((value) => !value)}
            className="text-text-secondary hover:text-text-primary"
          >
            {showExclusions ? t("activity.hideExcluded") : t("activity.editExcluded")}
          </button>
          {entries.length > 0 ? (
            <button
              type="button"
              onClick={() => void handleClear()}
              className="text-muted hover:text-red-400"
            >
              {t("activity.clearTimeline")}
            </button>
          ) : null}
        </div>

        {showHowItWorks ? (
          <div className="border-t border-border px-4 py-3 text-xs leading-relaxed text-muted sm:px-5">
            {t("activity.intervalNote", {
              interval: status?.interval_sec ?? 90,
              retention: status?.retention_days ?? 14,
            })}
          </div>
        ) : null}

        {showExclusions ? (
          <div className="flex flex-col gap-2 border-t border-border px-4 py-3 sm:flex-row sm:px-5">
            <input
              value={exclusionsDraft}
              onChange={(e) => setExclusionsDraft(e.target.value)}
              placeholder={t("activity.exclusionsPlaceholder")}
              className="min-w-0 flex-1 rounded-lg border border-border bg-bg-primary px-3 py-2 text-xs text-text-primary placeholder:text-muted"
            />
            <button
              type="button"
              onClick={() => void saveExclusions()}
              className="shrink-0 rounded-lg bg-button-primary px-4 py-2 text-xs font-medium text-white"
            >
              {t("activity.save")}
            </button>
          </div>
        ) : null}

        {proLocked && !status?.running && !hideProCard ? (
          <div className="border-t border-border px-4 py-3 sm:px-5">
            <ProUpgradeCard
              compact
              description={t("pro.activityFeature")}
              onUpgrade={() => onUpgrade?.()}
            />
          </div>
        ) : null}

        {status?.last_notice ? (
          <p className="border-t border-border px-4 py-2 text-xs text-muted sm:px-5">
            {t("activity.lastNotice", { notice: status.last_notice })}
          </p>
        ) : null}
        {status?.last_error ? (
          <p className="border-t border-border px-4 py-2 text-xs text-amber-500 sm:px-5">
            {t("activity.lastIssue", { error: status.last_error })}
          </p>
        ) : null}
      </section>

      {loading && entries.length === 0 ? (
        <ListSkeleton />
      ) : entries.length === 0 ? (
        <EmptyState
          title={t("activity.emptyTitle")}
          description={t("activity.emptyDesc")}
          primaryAction={
            !proLocked && !status?.running
              ? { label: t("activity.startCapture"), onClick: () => void toggleCapture() }
              : undefined
          }
        />
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => (
            <section key={group.day} className="space-y-2">
              <h3 className="sticky top-0 z-[1] -mx-1 bg-bg-primary/95 px-1 py-1 text-sm font-semibold text-text-primary backdrop-blur-sm">
                {group.day}
              </h3>
              <ul className="space-y-2">
                {group.items.map((entry) => {
                  const context = entryContextLabel(entry);
                  return (
                    <li
                      key={entry.id}
                      className={`${CARD_SHELL_CLASS} flex gap-4 px-4 py-3 sm:px-5`}
                    >
                      <time
                        dateTime={entry.captured_at}
                        className="w-12 shrink-0 pt-0.5 text-xs tabular-nums text-muted"
                      >
                        {formatClockTime(entry.captured_at)}
                      </time>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-relaxed text-text-primary">{entry.summary}</p>
                        {context ? (
                          <p className="mt-1 truncate text-xs text-muted">{context}</p>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
