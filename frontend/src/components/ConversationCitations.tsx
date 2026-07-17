/**
 * ConversationCitations — "Related conversations" chips shown beneath an
 * assistant answer.
 *
 * Honest recall: the chips come from a real backend search over the durable
 * conversation store (not a fabricated list). Clicking a chip opens that past
 * conversation, giving the user a citation trail for what the assistant knows.
 */

import { useEffect, useState } from "react";
import {
  searchStoredConversations,
  type ConversationSearchHit,
} from "../api/conversationsStore";
import { useConversations } from "../hooks/useConversations";

interface Props {
  /** The user's latest question — used as the recall query. */
  query: string;
  /** Current conversation id, excluded from results. */
  currentConversationId: string;
}

const MIN_SCORE = 0.18;
const MAX_CHIPS = 3;

export default function ConversationCitations({ query, currentConversationId }: Props) {
  const { setActive, conversations } = useConversations();
  const [hits, setHits] = useState<ConversationSearchHit[]>([]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 4) {
      setHits([]);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      void searchStoredConversations(trimmed, 6)
        .then((results) => {
          if (cancelled) return;
          const known = new Set(conversations.map((c) => c.id));
          setHits(
            results
              .filter(
                (r) =>
                  r.id !== currentConversationId &&
                  r.score >= MIN_SCORE &&
                  known.has(r.id),
              )
              .slice(0, MAX_CHIPS),
          );
        })
        .catch(() => {
          if (!cancelled) setHits([]);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, currentConversationId, conversations]);

  if (hits.length === 0) return null;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 px-1">
      <span className="text-[11px] font-medium text-muted">Related:</span>
      {hits.map((hit, i) => (
        <button
          key={hit.id}
          type="button"
          onClick={() => setActive(hit.id)}
          title={hit.summary || hit.title}
          className="inline-flex max-w-[14rem] items-center gap-1 truncate rounded-full border border-border bg-bg-secondary px-2 py-0.5 text-[11px] text-text-secondary transition-colors hover:border-accent hover:text-text-primary"
        >
          <span className="text-muted">[{i + 1}]</span>
          {hit.emoji ? <span>{String(hit.emoji)}</span> : null}
          <span className="truncate">{String(hit.title || "Untitled")}</span>
        </button>
      ))}
    </div>
  );
}
