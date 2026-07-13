/**
 * Unified recall search API client.
 */

import { requestValidated } from "./client";
import { z } from "zod";

const RecallHitSchema = z.object({
  source: z.string(),
  id: z.string(),
  title: z.string(),
  snippet: z.string(),
  score: z.number(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

const RecallSearchResponseSchema = z.object({
  query: z.string(),
  count: z.number(),
  results: z.array(RecallHitSchema),
});

export type RecallHit = z.infer<typeof RecallHitSchema>;

/** Search memories, conversations, activity, tasks, and meetings. */
export async function searchRecall(query: string, limit = 20): Promise<z.infer<typeof RecallSearchResponseSchema>> {
  const q = encodeURIComponent(query.trim());
  return requestValidated(
    `/recall/search?q=${q}&limit=${limit}`,
    RecallSearchResponseSchema,
  );
}
