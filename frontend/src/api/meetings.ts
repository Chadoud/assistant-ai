/**
 * API client for meeting mode (transcript capture -> end-of-meeting summary).
 */

import { z } from "zod";
import { requestValidated } from "./client";

const StartSchema = z.object({
  ok: z.boolean(),
  id: z.string(),
  title: z.string(),
  started_at: z.string(),
});

const NotesSchema = z.object({
  ok: z.boolean(),
  id: z.string(),
  title: z.string(),
  line_count: z.number(),
  lines: z.array(z.string()),
});

const EndSchema = z.object({
  ok: z.boolean(),
  id: z.string(),
  title: z.string().optional(),
  overview: z.string().optional(),
  highlights: z.array(z.string()).optional(),
  decisions: z.array(z.string()).optional(),
  action_items: z.array(z.string()).optional(),
  tasks_stored: z.number().optional(),
  skipped: z.string().optional(),
});

export type MeetingSummary = z.infer<typeof EndSchema>;

export function startMeeting(id: string, title = ""): Promise<z.infer<typeof StartSchema>> {
  return requestValidated("/meetings/start", StartSchema, {
    method: "POST",
    body: JSON.stringify({ id, title }),
  });
}

export function addMeetingNote(
  id: string,
  text: string,
  speaker?: string,
): Promise<{ ok: boolean; line_count?: number }> {
  return requestValidated(
    `/meetings/${encodeURIComponent(id)}/note`,
    z.object({ ok: z.boolean(), line_count: z.number().optional() }),
    { method: "POST", body: JSON.stringify({ text, speaker: speaker ?? null }) },
  );
}

export function fetchMeetingNotes(id: string, tail = 50): Promise<z.infer<typeof NotesSchema>> {
  return requestValidated(`/meetings/${encodeURIComponent(id)}/notes?tail=${tail}`, NotesSchema);
}

export function endMeeting(id: string): Promise<MeetingSummary> {
  return requestValidated(`/meetings/${encodeURIComponent(id)}/end`, EndSchema, {
    method: "POST",
  });
}
