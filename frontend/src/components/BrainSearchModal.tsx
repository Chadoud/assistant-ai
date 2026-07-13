/**
 * Global brain search modal — Cmd+Shift+K / Assistant recall.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { searchRecall, type RecallHit } from "../api/recall";
import { useI18n } from "../i18n/I18nContext";
import { splitHighlightSegments } from "../utils/memoryUi";

interface BrainSearchModalProps {
  open: boolean;
  onClose: () => void;
  backendOnline: boolean;
}

function sourceLabel(source: string, t: (key: string) => string): string {
  switch (source) {
    case "memory":
      return t("recall.sourceMemory");
    case "conversation":
      return t("recall.sourceConversation");
    case "meeting":
      return t("recall.sourceMeeting");
    case "activity":
      return t("recall.sourceActivity");
    case "task":
      return t("recall.sourceTask");
    default:
      return source;
  }
}

export default function BrainSearchModal({ open, onClose, backendOnline }: BrainSearchModalProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RecallHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setError(null);
    const tid = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(tid);
  }, [open]);

  const runSearch = useCallback(async (q: string) => {
    if (!backendOnline) {
      setError(t("recall.offline"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await searchRecall(q, 20);
      setResults(res.results);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("recall.failed"));
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [backendOnline, t]);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }
    const tid = window.setTimeout(() => void runSearch(trimmed), 250);
    return () => window.clearTimeout(tid);
  }, [open, query, runSearch]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh]" role="presentation" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-2xl border border-border bg-bg-primary shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={t("recall.title")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border p-3">
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("recall.placeholder")}
            className="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
          />
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-2">
          {loading ? <p className="px-2 py-3 text-sm text-muted">{t("recall.searching")}</p> : null}
          {error ? <p className="px-2 py-3 text-sm text-red-500">{error}</p> : null}
          {!loading && !error && query.trim() && results.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted">{t("recall.empty")}</p>
          ) : null}
          <ul className="space-y-1">
            {results.map((hit) => (
              <li key={`${hit.source}-${hit.id}`} className="rounded-lg px-2 py-2 hover:bg-hover-overlay">
                <div className="flex items-center gap-2 text-2xs uppercase tracking-wide text-muted">
                  <span>{sourceLabel(hit.source, t)}</span>
                </div>
                <p className="text-sm font-medium text-text-primary">{hit.title}</p>
                <p className="text-xs text-text-secondary">
                  {splitHighlightSegments(hit.snippet, query).map((seg, i) =>
                    seg.highlight ? (
                      <mark key={i} className="rounded bg-accent-soft text-text-primary">{seg.text}</mark>
                    ) : (
                      <span key={i}>{seg.text}</span>
                    ),
                  )}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
