import { useEffect, useMemo, useState } from "react";
import type { Conversation } from "../hooks/useConversations";
import { useI18n } from "../i18n/I18nContext";
import "../styles/exo.css";

const DAY_MS = 86_400_000;

type BucketId = "today" | "yesterday" | "last7" | "last30" | "older";

const SECTION_LABEL_KEYS: Record<BucketId, `assistant.${string}`> = {
  today: "assistant.chatHistorySectionToday",
  yesterday: "assistant.chatHistorySectionYesterday",
  last7: "assistant.chatHistorySectionLast7",
  last30: "assistant.chatHistorySectionLast30",
  older: "assistant.chatHistorySectionOlder",
};

/** Calendar buckets from local midnight, resilient to slight future timestamps. */
function recencyBucket(updatedAtMs: number, nowMs: number): BucketId {
  const startOfDay = (ts: number) => {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const today0 = startOfDay(nowMs);
  const conv0 = startOfDay(updatedAtMs);
  let dayDiff = Math.round((today0 - conv0) / DAY_MS);
  if (dayDiff < 0) dayDiff = 0;
  if (dayDiff === 0) return "today";
  if (dayDiff === 1) return "yesterday";
  if (dayDiff <= 7) return "last7";
  if (dayDiff <= 30) return "last30";
  return "older";
}

function subtitleForConversation(conv: Conversation): string {
  const msgs = conv.messages;
  const pick = msgs[msgs.length - 1]?.content ?? "";
  const compact = pick.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  return compact.length > 72 ? `${compact.slice(0, 71)}…` : compact;
}

interface ExoChatHistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  conversations: Conversation[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
}

const BUCKET_ORDER: BucketId[] = ["today", "yesterday", "last7", "last30", "older"];

/** Fixed column that grows from the right rail edge inward, pushing transcript + footer. Matches AI Manager chat shell tokens. */
export default function ExoChatHistoryDrawer({
  open,
  onClose,
  conversations,
  activeId,
  onSelect,
  onNew,
}: ExoChatHistoryDrawerProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const now = Date.now();
    const list =
      q.length === 0
        ? [...conversations]
        : conversations.filter((c) => {
            const sub = subtitleForConversation(c).toLowerCase();
            return c.title.toLowerCase().includes(q) || sub.includes(q);
          });

    list.sort((a, b) => b.updatedAt - a.updatedAt);

    const grouped = new Map<BucketId, Conversation[]>();
    for (const b of BUCKET_ORDER) grouped.set(b, []);
    for (const c of list) {
      const b = recencyBucket(c.updatedAt, now);
      grouped.get(b)!.push(c);
    }
    return { grouped };
  }, [conversations, query]);

  const handleNew = () => {
    onNew();
    onClose();
  };

  const handlePick = (id: string) => {
    onSelect(id);
    onClose();
  };

  return (
    <aside
      className={`flex min-h-0 shrink-0 flex-col overflow-hidden border-bg-secondary bg-bg-secondary transition-[width] duration-300 ease-out ${
        open
          ? "w-[clamp(240px,min(36vw),288px)] border-l border-border opacity-100"
          : "pointer-events-none w-0 border-transparent opacity-0"
      }`}
      aria-hidden={!open}
      aria-label={t("assistant.chatHistoryPanelAria")}
    >
      <div className="flex min-h-0 flex-1 w-full flex-col gap-3 p-3 pt-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("assistant.chatHistorySearchPlaceholder")}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="w-full rounded-xl border border-border bg-bg-secondary px-3.5 py-2.5 text-sm text-text-primary placeholder:text-muted transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            type="button"
            onClick={handleNew}
            className="flex w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-border bg-bg-secondary py-2.5 text-xs font-medium text-text-primary transition-colors hover:bg-hover-overlay hover:text-text-primary"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 shrink-0" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {t("assistant.chatHistoryNewChat")}
          </button>

          <div className="exo-chat-history-scroll min-h-0 flex-1 space-y-4 overflow-y-auto pr-0.5">
            {BUCKET_ORDER.map((bucket) => {
              const items = filtered.grouped.get(bucket) ?? [];
              if (items.length === 0) return null;
              return (
                <div key={bucket}>
                  <p className="mb-2 px-1 text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-muted">
                    {t(SECTION_LABEL_KEYS[bucket])}
                  </p>
                  <ul className="m-0 flex list-none flex-col gap-px p-0">
                    {items.map((conv) => {
                      const selected = conv.id === activeId;
                      const subtitle = subtitleForConversation(conv);
                      return (
                        <li key={conv.id}>
                          <button
                            type="button"
                            onClick={() => handlePick(conv.id)}
                            title={conv.title}
                            aria-current={selected ? ("true" as const) : undefined}
                            className={`flex w-full items-start gap-2.5 rounded-lg px-2 py-2.5 text-left transition-colors ${
                              selected
                                ? "bg-accent/14 text-text-primary"
                                : "text-text-primary hover:bg-hover-overlay"
                            }`}
                          >
                            <span className="mt-0.5 shrink-0" aria-hidden>
                              {selected ? (
                                <span className="text-base leading-none text-accent" aria-hidden>
                                  ✦
                                </span>
                              ) : conv.messages.some((m) => m.role === "assistant") ? (
                                <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 text-muted" aria-hidden>
                                  <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.25" />
                                  <path
                                    d="M6.85 10.05 9.2 12.4 13.4 8.2"
                                    stroke="currentColor"
                                    strokeWidth="1.25"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              ) : (
                                <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 text-muted" aria-hidden>
                                  <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.25" />
                                </svg>
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className={`block truncate text-sm leading-snug ${selected ? "font-semibold" : "font-medium"}`}>
                                {conv.title}
                              </span>
                              {subtitle ? (
                                <span className="mt-0.5 block line-clamp-2 text-[0.6875rem] leading-snug text-muted">
                                  {subtitle}
                                </span>
                              ) : null}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
    </aside>
  );
}
