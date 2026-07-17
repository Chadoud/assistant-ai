/**
 * API client for the durable conversation store (backend SQLite).
 * Distinct from the renderer's live chat state — this persists summaries so the
 * assistant can recall + cite past conversations.
 */

import { z } from "zod";
import { requestValidated } from "./client";

const ConversationSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  category: z.string().nullable(),
  emoji: z.string().nullable(),
  action_items: z.array(z.string()),
  created_at: z.string(),
  updated_at: z.string(),
  retain_tier: z.string().optional(),
  retain_score: z.number().optional(),
  retain_reasons: z.array(z.string()).optional(),
  ephemeral: z.boolean().optional(),
  archived_at: z.string().nullable().optional(),
  last_judged_at: z.string().nullable().optional(),
  pinned: z.boolean().optional(),
});

export type ConversationSummary = z.infer<typeof ConversationSummarySchema>;

const ConversationSearchHitSchema = ConversationSummarySchema.extend({
  score: z.number(),
});

export type ConversationSearchHit = z.infer<typeof ConversationSearchHitSchema>;

export type ChatTurn = {
  role: string;
  content: string;
  /** Mirror of ConversationMessage.calendarContext for recap origin matching. */
  calendar_context?: boolean;
  /** Mirror of ConversationMessage.mailRecap for recap origin matching. */
  mail_recap?: boolean;
  /** Tool name when role is tool (calendar/mail results). */
  name?: string;
};

export async function listStoredConversations(
  limit = 100,
  opts?: { mapEligible?: boolean; includeLowValue?: boolean },
): Promise<ConversationSummary[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (opts?.mapEligible) params.set("map_eligible", "1");
  if (opts?.includeLowValue) params.set("include_low_value", "1");
  return requestValidated(
    `/conversations?${params.toString()}`,
    z.array(ConversationSummarySchema),
  );
}

export async function searchStoredConversations(
  query: string,
  limit = 5,
): Promise<ConversationSearchHit[]> {
  return requestValidated(
    `/conversations/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    z.array(ConversationSearchHitSchema),
  );
}

export async function upsertStoredConversation(
  id: string,
  payload: {
    title?: string;
    summary?: string;
    category?: string | null;
    emoji?: string | null;
    messages?: ChatTurn[];
    action_items?: string[];
    created_at?: string | null;
  },
): Promise<ConversationSummary> {
  return requestValidated(`/conversations/${encodeURIComponent(id)}`, ConversationSummarySchema, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

const DistillResultSchema = z.object({
  ok: z.boolean(),
  title: z.string().optional(),
  overview: z.string().optional(),
  memories_stored: z.number().optional(),
  tasks_stored: z.number().optional(),
  action_items: z.array(z.string()).optional(),
  retain_tier: z.string().optional(),
  retain_score: z.number().optional(),
  error: z.string().optional(),
  skipped: z.string().optional(),
});

/** Run LLM extraction over a conversation's turns (summary + memories + tasks). */
export async function distillConversation(
  id: string,
  messages: ChatTurn[],
  originHints: string[] = [],
): Promise<z.infer<typeof DistillResultSchema>> {
  return requestValidated(
    `/conversations/${encodeURIComponent(id)}/distill`,
    DistillResultSchema,
    {
      method: "POST",
      body: JSON.stringify({
        messages,
        origin_hints: originHints.filter((h) => h.trim().length >= 6),
      }),
    },
  );
}
