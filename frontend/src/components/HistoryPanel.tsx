import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "../api";
import type { HistoryEntry } from "../api";
import { useI18n } from "../i18n/I18nContext";
import { inlineErrorMessage } from "../utils/userGuidance";
import { Spinner } from "./Spinner";
import HoverHelpCard from "./ui/HoverHelpCard";
import { CARD_SHELL_CLASS, GHOST_ICON_BTN_CLASS } from "../utils/styles";

type Filter = "all" | "copy" | "move" | "undone";

function basename(p: string) {
  return p.replace(/\\/g, "/").split("/").pop() ?? p;
}

function formatDate(ts: number) {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(ts: number) {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function groupBySession(entries: HistoryEntry[]): { sessionId: string; date: string; entries: HistoryEntry[] }[] {
  const map = new Map<string, HistoryEntry[]>();
  for (const e of entries) {
    const list = map.get(e.session_id) ?? [];
    list.push(e);
    map.set(e.session_id, list);
  }
  return [...map.entries()]
    .map(([sessionId, ses]) => ({
      sessionId,
      date: formatDate(Math.max(...ses.map((e) => e.timestamp))),
      entries: ses.sort((a, b) => b.timestamp - a.timestamp),
    }))
    .sort((a, b) => {
      const aMax = Math.max(...a.entries.map((e) => e.timestamp));
      const bMax = Math.max(...b.entries.map((e) => e.timestamp));
      return bMax - aMax;
    });
}

interface HistoryPanelProps {
  onGoToSort: () => void;
}

export default function HistoryPanel({ onGoToSort }: HistoryPanelProps) {
  const { t } = useI18n();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [undoing, setUndoing] = useState<string | null>(null);

  const filterLabels = useMemo(
    (): { id: Filter; label: string }[] => [
      { id: "all", label: t("history.filterAll") },
      { id: "copy", label: t("history.filterCopy") },
      { id: "move", label: t("history.filterMove") },
      { id: "undone", label: t("history.filterUndone") },
    ],
    [t],
  );

  const filterEmptyLabel = useMemo(() => {
    const match = filterLabels.find((f) => f.id === filter);
    return match?.label.toLowerCase() ?? filter;
  }, [filter, filterLabels]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { entries: data } = await api.getHistory();
      setEntries(data.sort((a, b) => b.timestamp - a.timestamp));
    } catch (e) {
      setError(inlineErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleUndo = async (entry: HistoryEntry) => {
    setUndoing(entry.id);
    try {
      await api.undoEntry(entry.id);
      setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, undone: true } : e)));
    } catch (e) {
      setError(inlineErrorMessage(e));
    } finally {
      setUndoing(null);
    }
  };

  const filtered = entries.filter((e) => {
    if (filter === "all") return true;
    if (filter === "undone") return e.undone;
    return e.mode === filter;
  });

  const grouped = groupBySession(filtered);

  const entryCountLabel =
    filtered.length === 1
      ? t("history.entryCountOne")
      : t("history.entryCountMany", { count: filtered.length });

  return (
    <div className="space-y-4 w-full">
      <div data-tour="history-panel-intro" className="flex items-center justify-between gap-3 flex-wrap">
        <HoverHelpCard hint={t("history.introHint")} className="min-w-0">
          <h1 className="text-lg font-semibold text-text-primary">{t("history.title")}</h1>
        </HoverHelpCard>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className={GHOST_ICON_BTN_CLASS}
          title={t("history.refreshAria")}
          aria-label={t("history.refreshAria")}
        >
          <Spinner className={`w-4 h-4 ${loading ? "animate-spin" : "[animation:none]"}`} />
        </button>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {filterLabels.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors border
              ${filter === id
                ? "bg-button-primary text-white border-accent"
                : "bg-bg-secondary border-border text-muted hover:text-text-primary"}`}
          >
            {label}
          </button>
        ))}
        {entries.length > 0 && (
          <span className="ml-auto text-xs text-muted self-center">{entryCountLabel}</span>
        )}
      </div>

      {error && (
        <div className="rounded-xl bg-error-soft border border-error-line p-4 text-sm text-error">{error}</div>
      )}

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className={`${CARD_SHELL_CLASS} p-4 space-y-2 animate-pulse`}>
              <div className="h-3 w-24 rounded bg-surface-subtle" />
              <div className="h-2.5 w-48 rounded bg-surface-subtle" />
            </div>
          ))}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <div className="w-12 h-12 rounded-2xl bg-surface-subtle flex items-center justify-center">
            <svg className="w-6 h-6 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-text-primary">{t("history.empty")}</p>
          <p className="text-xs text-muted max-w-xs">
            {filter === "all"
              ? t("history.emptySortPrompt")
              : t("history.emptyFilter", { filter: filterEmptyLabel })}
          </p>
          {filter === "all" && (
            <button
              type="button"
              onClick={onGoToSort}
              className="mt-1 inline-flex items-center justify-center text-sm font-semibold px-4 py-2 rounded-xl bg-button-primary text-white hover:bg-button-hover transition-colors"
            >
              {t("history.goToSort")}
            </button>
          )}
        </div>
      )}

      {!loading &&
        grouped.map((group) => {
          const sessionFileLabel =
            group.entries.length === 1
              ? t("history.sessionFileCountOne")
              : t("history.sessionFileCountMany", { count: group.entries.length });

          return (
            <section key={group.sessionId}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xs font-bold uppercase tracking-widest text-muted">{group.date}</span>
                <div className="flex-1 h-px bg-border" />
                <span className="text-2xs text-muted">{sessionFileLabel}</span>
              </div>

              <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
                {group.entries.map((entry) => (
                  <div
                    key={entry.id}
                    className={`flex items-center gap-3 px-4 py-3 transition-colors
                  ${entry.undone ? "bg-surface-subtle opacity-60" : "bg-bg-card hover:bg-hover-overlay"}`}
                  >
                    <span
                      className={`shrink-0 text-2xs font-semibold uppercase px-1.5 py-0.5 rounded-full border
                  ${entry.mode === "move"
                        ? "bg-warning-soft text-warning border-warning-line"
                        : "bg-info-soft text-info border-info-line"}`}
                    >
                      {entry.mode === "move" ? t("history.modeMove") : t("history.modeCopy")}
                    </span>

                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm font-medium truncate ${entry.undone ? "line-through text-muted" : "text-text-primary"}`}
                      >
                        {basename(entry.source_path)}
                      </p>
                      <p className="text-3xs text-muted truncate flex items-center gap-1 mt-0.5">
                        <span className="truncate">{basename(entry.dest_path)}</span>
                        <span className="shrink-0">·</span>
                        <span className="shrink-0 px-1.5 py-0.5 rounded bg-surface-subtle font-medium text-text-primary">
                          {entry.folder_name}
                        </span>
                      </p>
                    </div>

                    <span className="text-2xs text-muted shrink-0 tabular-nums">{formatTime(entry.timestamp)}</span>

                    {!entry.undone ? (
                      <button
                        type="button"
                        onClick={() => void handleUndo(entry)}
                        disabled={undoing === entry.id}
                        className={`shrink-0 ${GHOST_ICON_BTN_CLASS} hover:text-error hover:bg-error-soft`}
                        title={t("history.undoAria")}
                        aria-label={t("history.undoAria")}
                      >
                        {undoing === entry.id ? (
                          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                          </svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
                          </svg>
                        )}
                      </button>
                    ) : (
                      <span className="shrink-0 text-2xs text-muted px-1.5 py-0.5 rounded bg-surface-subtle">
                        {t("history.undoneLabel")}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
    </div>
  );
}
